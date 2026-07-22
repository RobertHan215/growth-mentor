/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
  resizeImagesForVision,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  resolveTextModel,
  suppressThinking,
  suppressThinkingInUserPrompt,
} from '@/lib/server/resolve-model';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!rawOutline.title) {
      log.error('Outline missing title:', rawOutline);
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline.title is required');
    }
    if (!rawOutline.type) {
      log.error('Outline missing type:', rawOutline);
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline.type is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = {
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    };

    // ── Model resolution from request headers ──
    // Use resolveTextModel: if user selected a VL-Thinking model, fall back to
    // the plain text model for content generation (no images are sent here).
    const { model: languageModel, modelInfo, modelString } = await resolveTextModel(req);
    log.info(
      `Generating content: "${outline.title}" (${outline.type}) [model=openai:${modelString}]`,
    );

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      // Suppress thinking for Qwen3-VL-Thinking models via /no_think directive
      const effectiveSystem = suppressThinking(systemPrompt, modelString);
      const effectiveUser = suppressThinkingInUserPrompt(userPrompt, modelString);

      // Dynamically calculate a safe output token budget.
      // Estimate input tokens at 3 chars/token (conservative for Chinese text).
      // Leave at least 256 tokens of safety margin to avoid off-by-one errors.
      const contextWindow = modelInfo?.contextWindow ?? 16384;
      const configuredOutput = modelInfo?.outputWindow ?? 1536;
      const estimatedInputTokens = Math.ceil((effectiveSystem.length + effectiveUser.length) / 3);
      const remainingTokens = contextWindow - estimatedInputTokens - 256;
      const safeOutputTokens = Math.min(configuredOutput, Math.max(512, remainingTokens));

      // Only send images when the model has a large enough context window.
      // For models with contextWindow <= 32768 the slide generation prompt alone
      // already consumes ~10k tokens — adding image tokens would overflow.
      const contextIsLarge = contextWindow > 32768;
      if (images?.length && hasVision && contextIsLarge) {
        const resizedImages = await resizeImagesForVision(images);
        const result = await callLLM(
          {
            model: languageModel,
            system: effectiveSystem,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(effectiveUser, resizedImages),
              },
            ],
            maxOutputTokens: safeOutputTokens,
          },
          'scene-content',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: effectiveSystem,
          prompt: effectiveUser,
          maxOutputTokens: safeOutputTokens,
        },
        'scene-content',
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const content = await generateSceneContent(
      effectiveOutline,
      aiCall,
      assignedImages,
      imageMapping,
      effectiveOutline.type === 'pbl' ? languageModel : undefined,
      hasVision,
      generatedMediaMapping,
      agents,
    );

    if (!content) {
      const errorMsg = `Failed to generate ${effectiveOutline.type} content for: "${effectiveOutline.title}"`;
      log.error(errorMsg);
      log.error('Outline details:', JSON.stringify(effectiveOutline, null, 2));

      return apiError('GENERATION_FAILED', 500, errorMsg);
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error('Scene content generation error:', error);

    // Better error message
    const errorMessage =
      error instanceof Error
        ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
        : String(error);

    log.error('Full error details:', errorMessage);

    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
