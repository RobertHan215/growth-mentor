/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_VISION_IMAGES, TOKENS_PER_VISION_IMAGE } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { buildPrompt, PROMPT_IDS } from './prompts';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { buildPdfChunks } from './pdf-chunker';
import { generateChunkedOutlines } from './outline-chunked-generator';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
    /** Model context window size in tokens (used for dynamic chunk sizing) */
    contextWindow?: number;
    /** Model output token reserve (used for dynamic chunk sizing) */
    outputTokenReserve?: number;
  },
): Promise<GenerationResult<SceneOutline[]>> {
  // Build available images description for the prompt
  let availableImagesText =
    requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      // Only include images with meaningful content (hasContent !== false)
      const allWithSrc = pdfImages.filter(
        (img) => options.imageMapping![img.id] && img.hasContent !== false,
      );
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter(
        (img) => !options.imageMapping![img.id] && img.hasContent !== false,
      );

      const visionDescriptions = visionSlice.map((img) =>
        formatImagePlaceholder(img, requirements.language),
      );
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img, requirements.language),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions (only content images)
      availableImagesText = pdfImages
        .filter((img) => img.hasContent !== false)
        .map((img) => formatImageDescription(img, requirements.language))
        .join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media generation policy based on enabled flags
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  let mediaGenerationPolicy = '';
  if (!imageEnabled && !videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
  } else if (!imageEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
  } else if (!videoEnabled) {
    mediaGenerationPolicy =
      '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
  }

  // Use simplified prompt variables
  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    // New simplified variables
    requirement: requirements.requirement,
    language: requirements.language,
    pdfContent: pdfText
      ? pdfText // chunking path handles oversized content; single-call path fits by definition
      : requirements.language === 'zh-CN'
        ? '无'
        : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    mediaGenerationPolicy,
    researchContext:
      options?.researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  const contextWindow = options?.contextWindow ?? 16384;
  const outputTokenReserve = options?.outputTokenReserve ?? 4096;

  // ── Chunking auto-detection ─────────────────────────────────────────────────
  // Strategy: estimate total tokens from the ACTUAL built prompt (system + user).
  // This is far more accurate than estimating the system prompt separately, because
  // the REQUIREMENTS_TO_OUTLINES system prompt is very large (~7000-9000 tokens).
  //
  // CRITICAL FIX: Also account for vision image tokens to prevent overflow.
  // Each image consumes ~1350 tokens (512px max-side), so even 3 images = 4050 tokens.
  //
  // If the full prompt already fits, use a single call.
  // If it overflows, rebuild with chunked PDF slices.
  if (pdfText && pdfText.length > 0) {
    const fullPromptChars = (prompts.system.length + prompts.user.length);
    // Chinese text: ~1.5 chars/token (not 3). Use conservative estimate to avoid undercount.
    const textTokens = Math.ceil(fullPromptChars / 1.5);

    // Count vision images that will be sent (limited by MAX_VISION_IMAGES)
    const visionImageCount = visionImages?.length || 0;
    const imageTokens = visionImageCount * TOKENS_PER_VISION_IMAGE;

    const estimatedTokens = textTokens + imageTokens;
    const maxInputTokens = contextWindow - outputTokenReserve - 256; // 256 = safety margin

    log.info(
      `[ChunkDetect] pdfText=${pdfText.length}chars, system=${prompts.system.length}chars, user=${prompts.user.length}chars, textTokens=${textTokens}, visionImages=${visionImageCount}, imageTokens=${imageTokens}, estimated=${estimatedTokens}tokens, limit=${maxInputTokens}tokens`,
    );

    if (estimatedTokens > maxInputTokens) {
      // Build chunks of the PDF text that fit within the budget
      const chunks = buildPdfChunks(pdfText, {
        contextWindow,
        outputTokenReserve,
        systemPromptChars: prompts.system.length, // pass real system prompt size for accurate budget
        imageMapping: options?.imageMapping,
        pdfImages,
        language: requirements.language,
      });

      if (chunks !== null) {
        log.info(
          `Full prompt ~${estimatedTokens} tokens > ${maxInputTokens} limit. Splitting PDF into ${chunks.length} chunks.`,
        );
        callbacks?.onProgress?.({
          currentStage: 1,
          overallProgress: 10,
          stageProgress: 10,
          statusMessage: `内容较多，分${chunks.length}段处理中...`,
          scenesGenerated: 0,
          totalScenes: 0,
        });

        try {
          const result = await generateChunkedOutlines(chunks, requirements, aiCall, {
            mediaGenerationPolicy,
            teacherContext: options?.teacherContext || '',
            researchContext:
              options?.researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
            onChunkComplete: (chunkIndex, totalChunks) => {
              const progress = Math.round((chunkIndex / totalChunks) * 80) + 10;
              callbacks?.onProgress?.({
                currentStage: 1,
                overallProgress: progress,
                stageProgress: Math.round((chunkIndex / totalChunks) * 100),
                statusMessage: `已处理第${chunkIndex}/${totalChunks}段内容...`,
                scenesGenerated: 0,
                totalScenes: 0,
              });
            },
          });

          callbacks?.onProgress?.({
            currentStage: 1,
            overallProgress: 50,
            stageProgress: 100,
            statusMessage: `已生成 ${result.length} 个场景大纲`,
            scenesGenerated: 0,
            totalScenes: result.length,
          });

          return { success: true, data: result };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      }
      // chunks is null (only 1 chunk even after splitting) — fall through to single call
      log.warn(
        `Prompt estimated at ${estimatedTokens} tokens but PDF can't be further split. Proceeding with single call.`,
      );
    } else {
      log.debug(`Full prompt ~${estimatedTokens} tokens — fits in single call (limit=${maxInputTokens}).`);
    }
  }

  // ── Single-call path (PDF fits in context window) ─────────────────────────
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      callbacks?.onProgress?.({
        currentStage: 1,
        overallProgress: 20,
        stageProgress: 50,
        statusMessage: attempt > 1
          ? `正在重新生成场景大纲（第${attempt}次尝试）...`
          : '正在分析需求，生成场景大纲...',
        scenesGenerated: 0,
        totalScenes: 0,
      });

      const response = await aiCall(prompts.system, prompts.user, visionImages);
      log.debug(`LLM raw response for outlines (first 500 chars): ${response.substring(0, 500)}`);
      const outlines = parseJsonResponse<SceneOutline[]>(response);

      log.info(`[generateSceneOutlines] parseJsonResponse returned: ${outlines === null ? 'null' : `array(${Array.isArray(outlines) ? outlines.length : 'NOT_ARRAY'})`}`);
      if (outlines && !Array.isArray(outlines)) {
        log.error(`parseJsonResponse returned non-array type: ${typeof outlines}`);
      }

      if (!outlines || !Array.isArray(outlines)) {
        log.error(
          `Failed to parse outlines (not an array or null, attempt ${attempt}/${maxRetries}). Full LLM response (${response.length} chars):\n${response.substring(0, 3000)}${response.length > 3000 ? '\n... [truncated]' : ''}`,
        );
        if (attempt < maxRetries) continue;
        return {
          success: false,
          error: 'Failed to parse scene outlines — AI response was not valid JSON array',
        };
      }

      // Filter out outlines missing required fields (same as chunked path)
      const validOutlines = outlines.filter((o): o is SceneOutline => !!o?.type && !!o?.title);
      if (validOutlines.length === 0) {
        log.error(
          `All outlines missing required fields (title/type, attempt ${attempt}/${maxRetries}). Full LLM response (${response.length} chars):\n${response.substring(0, 3000)}${response.length > 3000 ? '\n... [truncated]' : ''}`,
        );
        if (attempt < maxRetries) continue;
        return {
          success: false,
          error: 'All generated outlines are missing required fields (title/type)',
        };
      }
      if (validOutlines.length < outlines.length) {
        log.warn(
          `Filtered ${outlines.length - validOutlines.length} outlines missing title/type. ` +
            `Valid: ${validOutlines.length}, Total: ${outlines.length}`,
        );
      }

      // Ensure IDs, order, and language
      const enriched = validOutlines.map((outline, index) => ({
        ...outline,
        id: outline.id || nanoid(),
        order: index + 1,
        language: requirements.language,
      }));

      // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
      const result = uniquifyMediaElementIds(enriched);

      callbacks?.onProgress?.({
        currentStage: 1,
        overallProgress: 50,
        stageProgress: 100,
        statusMessage: `已生成 ${result.length} 个场景大纲`,
        scenesGenerated: 0,
        totalScenes: result.length,
      });

      return { success: true, data: result };
    } catch (error) {
      if (attempt < maxRetries) {
        log.warn(`Outline generation error (attempt ${attempt}/${maxRetries}): ${error}`);
        continue;
      }
      return { success: false, error: String(error) };
    }
  }

  // Should not reach here, but TypeScript needs it
  return { success: false, error: 'Unexpected error in outline generation' };
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  return outline;
}
