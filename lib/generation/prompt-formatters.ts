/**
 * Prompt and context building utilities for the generation pipeline.
 */

import type { PdfImage } from '@/lib/types/generation';
import type { AgentInfo, SceneGenerationContext } from './pipeline-types';

// ---------------------------------------------------------------------------
// Server-side image resize before vision calls
// ---------------------------------------------------------------------------

/**
 * Max pixel length for vision images sent to the model.
 * Qwen3-VL tokenises ~1 token per 14×14 pixels tile, so 512px max-side
 * keeps most PDF slides well under 1350 tokens per image.
 */
export const VISION_IMAGE_MAX_PX = 512;

export type VisionImage = { id: string; src: string; width?: number; height?: number };

/**
 * Resize a base64 image (data URI or raw base64 + mimeType) so that neither
 * dimension exceeds `maxPx`. If the image is already small enough the
 * original bytes are returned untouched (no re-encoding overhead).
 *
 * SERVER-ONLY: uses the `sharp` npm package — never import in client code.
 */
export async function resizeImageForVision(
  src: string,
  maxPx = VISION_IMAGE_MAX_PX,
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');

    let inputBuffer: Buffer;
    let outputMime = 'image/jpeg';

    const dataUriMatch = src.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      outputMime = dataUriMatch[1];
      inputBuffer = Buffer.from(dataUriMatch[2], 'base64');
    } else {
      // raw base64 (already stripped)
      inputBuffer = Buffer.from(src, 'base64');
    }

    const img = sharp(inputBuffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    // Already small enough — avoid re-encoding
    if (w <= maxPx && h <= maxPx) return src;

    const resized = await img
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const b64 = resized.toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    // If sharp fails for any reason, return the original (safe fallback)
    return src;
  }
}

/**
 * Resize all vision images in parallel before passing to buildVisionUserContent.
 */
export async function resizeImagesForVision(
  images: VisionImage[],
  maxPx = VISION_IMAGE_MAX_PX,
): Promise<VisionImage[]> {
  return Promise.all(
    images.map(async (img) => {
      const resized = await resizeImageForVision(img.src, maxPx);
      return { ...img, src: resized };
    }),
  );
}

/** Build a course context string for injection into action prompts */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // Course outline with position marker.
  // For large courses on small-context models, only show nearby slides to save tokens.
  // Always include: first page, last page, and a window around the current page.
  const CONTEXT_WINDOW = 4; // pages before and after current to show
  const currentIdx = ctx.pageIndex - 1; // 0-based
  const total = ctx.allTitles.length;
  const showAll = total <= 12;

  lines.push('Course Outline:');
  ctx.allTitles.forEach((t, i) => {
    const isCurrent = i === currentIdx;
    const isFirst = i === 0;
    const isLast = i === total - 1;
    const isNearby = Math.abs(i - currentIdx) <= CONTEXT_WINDOW;

    if (!showAll && !isCurrent && !isFirst && !isLast && !isNearby) return; // skip distant pages

    const marker = isCurrent ? ' ← current' : '';
    // Insert ellipsis when skipping pages
    if (!showAll && i > 1 && !isNearby && !isCurrent && i !== total - 1) return;
    lines.push(`  ${i + 1}. ${t}${marker}`);
  });
  if (!showAll) {
    lines.push(`  ... (${total} pages total, showing context around current page)`);
  }

  // Position information
  lines.push('');
  lines.push(
    'IMPORTANT: All pages belong to the SAME class session. Do NOT greet again after the first page. When referencing content from earlier pages, say "we just covered" or "as mentioned on page N" — NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');
  if (ctx.pageIndex === 1) {
    lines.push('Position: This is the FIRST page. Open with a greeting and course introduction.');
  } else if (ctx.pageIndex === ctx.totalPages) {
    lines.push('Position: This is the LAST page. Conclude the course with a summary and closing.');
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  } else {
    lines.push(`Position: Page ${ctx.pageIndex} of ${ctx.totalPages} (middle of the course).`);
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  }

  // Previous page speech for transition reference
  if (ctx.previousSpeeches.length > 0) {
    lines.push('');
    lines.push('Previous page speech (for transition reference):');
    const lastSpeech = ctx.previousSpeeches[ctx.previousSpeeches.length - 1];
    lines.push(`  "...${lastSpeech.slice(-150)}"`);
  }

  return lines.join('\n');
}

/** Format agent list for injection into action prompts */
export function formatAgentsForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const lines = ['Classroom Agents:'];
  for (const a of agents) {
    const personaPart = a.persona ? ` — ${a.persona}` : '';
    lines.push(`- id: "${a.id}", name: "${a.name}", role: ${a.role}${personaPart}`);
  }
  return lines.join('\n');
}

/** Extract the teacher agent's persona for injection into outline/content prompts */
export function formatTeacherPersonaForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher?.persona) return '';

  return `Teacher Persona:\nName: ${teacher.name}\n${teacher.persona}\n\nAdapt the content style and tone to match this teacher's personality. IMPORTANT: The teacher's name and identity must NOT appear on the slides — no "Teacher ${teacher.name}'s tips", no "Teacher's message", etc. Slides should read as neutral, professional visual aids.`;
}

/**
 * Format a single PdfImage description for prompt inclusion.
 * Includes dimension/aspect-ratio info when available.
 */
export function formatImageDescription(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`;
  }
  const desc = img.description ? ` | ${img.description}` : '';
  return language === 'zh-CN'
    ? `- **${img.id}**: 来自PDF第${img.pageNumber}页${dimInfo}${desc}`
    : `- **${img.id}**: from PDF page ${img.pageNumber}${dimInfo}${desc}`;
}

/**
 * Format a short image placeholder for vision mode.
 * Only ID + page + dimensions + aspect ratio (no description), since the model can see the actual image.
 */
export function formatImagePlaceholder(img: PdfImage, language: string): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | 尺寸: ${img.width}×${img.height} (宽高比${ratio})`;
  }
  return language === 'zh-CN'
    ? `- **${img.id}**: PDF第${img.pageNumber}页的图片${dimInfo} [参见附图]`
    : `- **${img.id}**: image from PDF page ${img.pageNumber}${dimInfo} [see attached]`;
}

/**
 * Build a multimodal user content array for the AI SDK.
 * Interleaves text and images so the model can associate img_id with actual image.
 * Each image label includes dimensions when available so the model knows the size
 * before seeing the image (important for layout decisions).
 */
export function buildVisionUserContent(
  userPrompt: string,
  images: Array<{ id: string; src: string; width?: number; height?: number }>,
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
  > = [{ type: 'text', text: userPrompt }];
  if (images.length > 0) {
    parts.push({ type: 'text', text: '\n\n--- Attached Images ---' });
    for (const img of images) {
      let dimInfo = '';
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        dimInfo = ` (${img.width}×${img.height}, 宽高比${ratio})`;
      }
      parts.push({ type: 'text', text: `\n**${img.id}**${dimInfo}:` });
      // Strip data URI prefix — AI SDK only accepts http(s) URLs or raw base64
      const dataUriMatch = img.src.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        parts.push({
          type: 'image',
          image: dataUriMatch[2],
          mimeType: dataUriMatch[1],
        });
      } else {
        parts.push({ type: 'image', image: img.src });
      }
    }
  }
  return parts;
}
