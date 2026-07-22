/**
 * Chunked outline generator.
 *
 * Orchestrates multi-call outline generation for large PDFs:
 * 1. For each chunk, call the LLM to get partial outlines.
 * 2. After all chunks are processed, call the LLM once more to merge/deduplicate
 *    the partial outlines into a final coherent course structure.
 */

import { nanoid } from 'nanoid';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { AICallFn } from './pipeline-types';
import { buildPrompt, PROMPT_IDS } from './prompts';
import type { PdfChunk } from './pdf-chunker';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import { createLogger } from '@/lib/logger';

const log = createLogger('ChunkedOutlines');

// ─── per-chunk prompt ─────────────────────────────────────────────────────────

/**
 * Build system + user prompts for processing a single PDF chunk.
 * We reuse the REQUIREMENTS_TO_OUTLINES template but inject chunk metadata
 * so the model knows this is partial content.
 */
function buildChunkPrompt(
  chunk: PdfChunk,
  requirements: UserRequirements,
  mediaGenerationPolicy: string,
  teacherContext: string,
  researchContext: string,
): { system: string; user: string } | null {
  const chunkHeader =
    requirements.language === 'zh-CN'
      ? `[PDF分段处理 - 第${chunk.chunkIndex}段，共${chunk.totalChunks}段，包含第${chunk.pageNumbers[0]}-${chunk.pageNumbers[chunk.pageNumbers.length - 1]}页]`
      : `[PDF chunk ${chunk.chunkIndex} of ${chunk.totalChunks}, pages ${chunk.pageNumbers[0]}-${chunk.pageNumbers[chunk.pageNumbers.length - 1]}]`;

  const chunkInstruction =
    requirements.language === 'zh-CN'
      ? `\n\n注意：这是PDF的第${chunk.chunkIndex}段内容。请只基于本段内容生成场景大纲。不需要生成课程开场或结尾（除非这是第一段或最后一段）。返回JSON数组。`
      : `\n\nNote: This is chunk ${chunk.chunkIndex} of ${chunk.totalChunks}. Generate scene outlines based ONLY on this section's content. Skip intro/outro unless this is chunk 1 or the last chunk. Return a JSON array.`;

  const imageText = chunk.imageDescriptions
    ? chunk.imageDescriptions
    : requirements.language === 'zh-CN'
      ? '无可用图片'
      : 'No images available';

  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    requirement: requirements.requirement + chunkInstruction,
    language: requirements.language,
    pdfContent: chunkHeader + '\n\n' + chunk.text,
    availableImages: imageText,
    researchContext,
    mediaGenerationPolicy,
    teacherContext,
    userProfile: '',
  });

  return prompts || null;
}

// ─── merge prompt ──────────────────────────────────────────────────────────────

/**
 * Build the final merge prompt that asks the LLM to combine all partial outlines
 * into a single coherent course structure, removing duplicate topics.
 */
function buildMergePrompt(
  partialOutlines: SceneOutline[][],
  requirements: UserRequirements,
): { system: string; user: string } {
  const isZh = requirements.language === 'zh-CN';

  const system = isZh
    ? `你是课程设计专家。你将收到一份课程的多个分段大纲（JSON数组）。请将它们合并为一个完整、连贯的课程大纲。

规则：
1. 去除重复或高度相似的主题（保留最完整的版本）
2. 保持内容的逻辑顺序（按照原始顺序）
3. 确保课程有完整的开场（第一个场景）和收尾（最后一个场景）
4. 每个场景保留原有的 type、title、description、keyPoints 等字段
5. 不要修改 quizConfig、interactiveConfig 等配置字段
6. 返回纯 JSON 数组，不要任何解释文字`
    : `You are a curriculum design expert. You will receive multiple partial outlines (JSON arrays) from different sections of a PDF. Merge them into a single coherent course outline.

Rules:
1. Remove duplicate or highly similar topics (keep the most complete version)
2. Preserve logical order (follow the original ordering)
3. Ensure the course has a proper introduction (first scene) and conclusion (last scene)
4. Keep all fields: type, title, description, keyPoints, quizConfig, etc.
5. Return a pure JSON array with no explanatory text`;

  const parts = partialOutlines.map((outlines, i) => {
    const label = isZh ? `第${i + 1}段大纲：` : `Chunk ${i + 1} outlines:`;
    return `${label}\n${JSON.stringify(outlines, null, 2)}`;
  });

  const instruction = isZh
    ? '请合并以上所有分段大纲，返回完整的课程大纲 JSON 数组：'
    : 'Please merge all partial outlines above and return the complete course outline as a JSON array:';

  return {
    system,
    user: parts.join('\n\n---\n\n') + '\n\n' + instruction,
  };
}

// ─── main export ──────────────────────────────────────────────────────────────

export interface ChunkedOutlineOptions {
  mediaGenerationPolicy?: string;
  teacherContext?: string;
  researchContext?: string;
  /** Called after each chunk is processed, with the outlines found so far */
  onChunkComplete?: (chunkIndex: number, totalChunks: number, partialOutlines: SceneOutline[]) => void;
}

/**
 * Generate scene outlines by processing a large PDF in chunks.
 *
 * Algorithm:
 * 1. Process each chunk sequentially (serial, not parallel — avoids GPU OOM).
 * 2. Collect partial outline arrays.
 * 3. Call the LLM once more to merge and deduplicate all partial outlines.
 * 4. Return the final merged outline list.
 */
export async function generateChunkedOutlines(
  chunks: PdfChunk[],
  requirements: UserRequirements,
  aiCall: AICallFn,
  options: ChunkedOutlineOptions = {},
): Promise<SceneOutline[]> {
  const {
    mediaGenerationPolicy = '',
    teacherContext = '',
    researchContext = requirements.language === 'zh-CN' ? '无' : 'None',
    onChunkComplete,
  } = options;

  const partialOutlines: SceneOutline[][] = [];

  // ── Step 1: Process each chunk sequentially ──────────────────────────────
  for (const chunk of chunks) {
    log.info(
      `Processing chunk ${chunk.chunkIndex}/${chunk.totalChunks} (pages ${chunk.pageNumbers[0]}-${chunk.pageNumbers[chunk.pageNumbers.length - 1]})`,
    );

    const prompts = buildChunkPrompt(
      chunk,
      requirements,
      mediaGenerationPolicy,
      teacherContext,
      researchContext,
    );

    if (!prompts) {
      log.warn(`Failed to build prompt for chunk ${chunk.chunkIndex}, skipping`);
      continue;
    }

    try {
      const response = await aiCall(prompts.system, prompts.user, chunk.visionImages);
      log.debug(
        `Chunk ${chunk.chunkIndex} response (first 300 chars): ${response.substring(0, 300)}`,
      );

      const parsed = parseJsonResponse<SceneOutline[]>(response);
      if (!parsed || !Array.isArray(parsed)) {
        log.warn(
          `Failed to parse outlines from chunk ${chunk.chunkIndex}, skipping. Response: ${response.substring(0, 500)}`,
        );
        continue;
      }

      // Filter out malformed outlines (no type or title)
      const valid = parsed.filter((o) => o?.type && o?.title);
      log.info(`Chunk ${chunk.chunkIndex}: got ${valid.length} valid outlines`);

      partialOutlines.push(valid);
      onChunkComplete?.(chunk.chunkIndex, chunk.totalChunks, valid);
    } catch (err) {
      log.error(`Error processing chunk ${chunk.chunkIndex}:`, err);
      // Continue with next chunk rather than aborting entirely
    }
  }

  if (partialOutlines.length === 0) {
    throw new Error('All PDF chunks failed to generate outlines');
  }

  // If only one chunk succeeded, return it directly (no merge needed)
  if (partialOutlines.length === 1) {
    return enrichOutlines(partialOutlines[0], requirements);
  }

  // ── Step 2: Merge all partial outlines with a final LLM call ──────────────
  log.info(`Merging ${partialOutlines.length} partial outline sets...`);

  const mergePrompts = buildMergePrompt(partialOutlines, requirements);

  let merged: SceneOutline[];
  try {
    const mergeResponse = await aiCall(mergePrompts.system, mergePrompts.user);
    log.debug(`Merge response (first 500 chars): ${mergeResponse.substring(0, 500)}`);

    const parsedMerge = parseJsonResponse<SceneOutline[]>(mergeResponse);
    if (!parsedMerge || !Array.isArray(parsedMerge) || parsedMerge.length === 0) {
      log.warn('Merge LLM call failed, falling back to simple concatenation');
      merged = partialOutlines.flat();
    } else {
      merged = parsedMerge;
    }
  } catch (err) {
    log.error('Merge call threw, falling back to simple concatenation:', err);
    merged = partialOutlines.flat();
  }

  return enrichOutlines(merged, requirements);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function enrichOutlines(outlines: SceneOutline[], requirements: UserRequirements): SceneOutline[] {
  // Assign IDs, order, language; deduplicate media element IDs
  const withMeta = outlines.map((outline, index) => ({
    ...outline,
    id: outline.id || nanoid(),
    order: index + 1,
    language: requirements.language,
  }));
  return uniquifyMediaElementIds(withMeta);
}
