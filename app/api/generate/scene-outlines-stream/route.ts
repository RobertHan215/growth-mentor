/**
 * Scene Outlines Streaming API (SSE)
 *
 * Streams outline generation via Server-Sent Events.
 * Emits individual outline objects as they're parsed from the LLM response,
 * so the frontend can display them incrementally.
 *
 * SSE events:
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[] }
 *   { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  resizeImagesForVision,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type { UserRequirements, PdfImage, ImageMapping } from '@/lib/types/generation';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import {
  resolveTextModel,
  suppressThinking,
  suppressThinkingInUserPrompt,
} from '@/lib/server/resolve-model';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
const log = createLogger('Outlines Stream');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get API configuration from request headers
    // Use resolveTextModel: if user selected a VL-Thinking model, fall back to
    // plain text model for outline generation (no images are sent here).
    const { model: languageModel, modelInfo, modelString } = await resolveTextModel(req);

    if (!body.requirements) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Requirements are required');
    }

    const { requirements, pdfText, pdfImages, imageMapping, researchContext, agents } = body as {
      requirements: UserRequirements;
      pdfText?: string;
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      researchContext?: string;
      agents?: AgentInfo[];
    };

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;
    const contextWindow = modelInfo?.contextWindow ?? 16384;
    const outputTokenReserve = modelInfo?.outputWindow ?? 2048;

    // Build media generation policy based on enabled flags
    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';
    let mediaGenerationPolicy = '';
    if (!imageGenerationEnabled && !videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
    } else if (!imageGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
    } else if (!videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
    }

    // Build teacher context from agents (if available)
    const teacherContext = formatTeacherPersonaForPrompt(agents);

    log.info(
      `Generating outlines: "${requirements.requirement.substring(0, 50)}" [model=${modelString}]`,
    );

    // Build imageMapping for the outline generator
    let visionImages:
      | Array<{ id: string; src: string; width?: number; height?: number }>
      | undefined;
    let availableImagesText =
      requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';

    if (pdfImages && pdfImages.length > 0) {
      if (hasVision && imageMapping) {
        const allWithSrc = pdfImages.filter((img) => imageMapping[img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = pdfImages.filter((img) => !imageMapping[img.id]);

        const visionDescriptions = visionSlice.map((img) =>
          formatImagePlaceholder(img, requirements.language),
        );
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, requirements.language),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: imageMapping[img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        availableImagesText = pdfImages
          .map((img) => formatImageDescription(img, requirements.language))
          .join('\n');
      }
    }

    // ── Build the aiCall function (用 callLLM, 支持分块; 也支持视觉模式) ──
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      const effectiveSystem = suppressThinking(systemPrompt, modelString);
      const effectiveUser = suppressThinkingInUserPrompt(userPrompt, modelString);

      if (images?.length && hasVision) {
        const resized = await resizeImagesForVision(images);
        const result = await callLLM(
          {
            model: languageModel,
            system: effectiveSystem,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(effectiveUser, resized),
              },
            ],
            maxOutputTokens: outputTokenReserve,
          },
          'scene-outlines-stream',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: effectiveSystem,
          prompt: effectiveUser,
          maxOutputTokens: outputTokenReserve,
        },
        'scene-outlines-stream',
      );
      return result.text;
    };

    // ── SSE stream ──
    const encoder = new TextEncoder();
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const stream = new ReadableStream({
      async start(controller) {
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(':heartbeat\n\n'));
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        try {
          startHeartbeat();

          // Use generateSceneOutlinesFromRequirements — it handles both
          // single-call and chunked paths transparently.
          const result = await generateSceneOutlinesFromRequirements(
            requirements,
            pdfText,
            pdfImages,
            aiCall,
            undefined, // callbacks
            {
              visionEnabled: hasVision,
              imageMapping,
              imageGenerationEnabled,
              videoGenerationEnabled,
              researchContext,
              teacherContext,
              contextWindow,
              outputTokenReserve,
            },
          );

          if (!result.success || !result.data) {
            const errorEvent = JSON.stringify({
              type: 'error',
              error: result.error || 'Failed to generate outlines',
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
            return;
          }

          const outlines = result.data;

          // Stream each outline to the client individually
          for (let i = 0; i < outlines.length; i++) {
            const event = JSON.stringify({ type: 'outline', data: outlines[i], index: i });
            try {
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            } catch {
              break;
            }
          }

          // Send done event
          const doneEvent = JSON.stringify({ type: 'done', outlines });
          try {
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } catch {
            /* client disconnected */
          }
        } catch (error) {
          log.error('Stream generation error:', error);
          const errorEvent = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          try {
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          } catch {
            /* already closed */
          }
        } finally {
          stopHeartbeat();
          try {
            controller.close();
          } catch {
            /* already closed by client disconnect */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Streaming error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
