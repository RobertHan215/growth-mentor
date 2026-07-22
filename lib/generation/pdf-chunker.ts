/**
 * PDF Chunker — splits large PDF text into manageable chunks for LLM processing.
 *
 * Strategy:
 * 1. Split the raw PDF text into per-page segments (using form-feed \f or
 *    double-newlines as page separators).
 * 2. Calculate how many pages fit in the model's available token budget.
 * 3. Group pages into chunks and attach the corresponding PdfImage slices.
 *
 * The chunk size is dynamic: it adapts to the actual character density of the
 * PDF rather than using a fixed byte limit.
 */

import type { PdfImage, ImageMapping } from '@/lib/types/generation';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * Conservative estimate of how many characters map to one token.
 * Chinese text is ~1–1.5 chars/token. We use 1.5 as a safe lower-bound
 * so the estimated token count is never too low (i.e. we never undercount
 * and overflow the context window).
 */
const CHARS_PER_TOKEN = 1.5;

/**
 * Rough token count reserved for the outline system prompt
 * (template text, JSON schema examples, instructions).
 */
const SYSTEM_PROMPT_TOKEN_RESERVE = 3000;

/**
 * Safety margin: only use 75 % of the theoretical budget so transient
 * estimation errors don't overflow the context window.
 */
const SAFETY_FACTOR = 0.75;

// ─── types ────────────────────────────────────────────────────────────────────

export interface PdfChunk {
  /** 1-based index of this chunk */
  chunkIndex: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Raw PDF text for the pages in this chunk */
  text: string;
  /** 1-based page numbers included in this chunk */
  pageNumbers: number[];
  /** Vision images whose pageNumber falls in this chunk */
  visionImages?: Array<{ id: string; src: string; width?: number; height?: number }>;
  /** Text-only image descriptions for images in this chunk */
  imageDescriptions?: string;
}

// ─── page splitting ───────────────────────────────────────────────────────────

/**
 * Split a PDF text blob into per-page strings.
 *
 * PDF.js (and most PDF extractors) insert a form-feed character (\f / \x0C)
 * between pages. If no form-feeds are found we fall back to splitting on
 * sequences of ≥ 3 consecutive newlines, which usually indicates a page break
 * in plain-text exports.
 */
export function splitPdfTextIntoPages(text: string): string[] {
  let pages: string[];

  if (text.includes('\f')) {
    // Primary: form-feed separated pages
    pages = text.split('\f');
  } else {
    // Fallback: triple-newline as implicit page boundary
    pages = text.split(/\n{3,}/);
  }

  // Filter out completely empty pages
  return pages.map((p) => p.trim()).filter((p) => p.length > 0);
}

// ─── budget calculation ───────────────────────────────────────────────────────

/**
 * Calculate how many PDF pages fit safely in one LLM call.
 *
 * @param avgCharsPerPage   Average character count of one PDF page
 * @param contextWindow     Model's total context window (in tokens)
 * @param outputTokenReserve Tokens reserved for the model's output
 * @returns Minimum 1 page per chunk, maximum all pages (no chunking)
 */
export function calculatePagesPerChunk(
  avgCharsPerPage: number,
  contextWindow: number,
  outputTokenReserve: number,
): number {
  // Tokens available for PDF content
  const availableTokens =
    (contextWindow - SYSTEM_PROMPT_TOKEN_RESERVE - outputTokenReserve) * SAFETY_FACTOR;

  // Convert to character budget
  const charBudget = availableTokens * CHARS_PER_TOKEN;

  if (avgCharsPerPage <= 0) return 10; // safe default

  const pagesPerChunk = Math.floor(charBudget / avgCharsPerPage);
  return Math.max(1, pagesPerChunk);
}

// ─── chunk building ───────────────────────────────────────────────────────────

export interface BuildChunksOptions {
  contextWindow: number;
  outputTokenReserve: number;
  /**
   * Actual system prompt character count (will be converted to tokens internally).
   * When provided, overrides the built-in SYSTEM_PROMPT_TOKEN_RESERVE constant so
   * the charBudget is calculated from the real prompt size rather than an estimate.
   */
  systemPromptChars?: number;
  imageMapping?: ImageMapping;
  pdfImages?: PdfImage[];
  language?: string;
}

/**
 * Split PDF content into chunks that fit in the model's context window.
 *
 * Returns `null` when the entire PDF fits in a single chunk (no chunking needed).
 * Callers can then skip the chunked pipeline and use the original single-call path.
 *
 * Two splitting strategies:
 * 1. Page-based  — when the extractor injected form-feed chars (\f) or the
 *    detected page count is > 1. Preserves natural page boundaries.
 * 2. Char-based  — fallback when no page boundaries are detected. Splits the
 *    raw text into fixed-size character windows.
 */
export function buildPdfChunks(
  pdfText: string,
  options: BuildChunksOptions,
): PdfChunk[] | null {
  const { contextWindow, outputTokenReserve } = options;

  // ── Budget calculation ─────────────────────────────────────────────────────
  // Use the caller-supplied system prompt size when available (more accurate).
  // Fall back to the built-in constant only when the caller didn't measure it.
  const systemTokens = options.systemPromptChars != null
    ? Math.ceil(options.systemPromptChars / CHARS_PER_TOKEN)
    : SYSTEM_PROMPT_TOKEN_RESERVE;

  const availableTokens =
    (contextWindow - systemTokens - outputTokenReserve) * SAFETY_FACTOR;
  const charBudget = Math.max(1000, availableTokens * CHARS_PER_TOKEN);

  // ── Does the text fit in a single call? ────────────────────────────────────
  // Compare raw PDF text length (+ 10% overhead margin) against char budget.
  const textWithMargin = pdfText.length * 1.1;
  if (textWithMargin <= charBudget) return null;

  // ── Try page-based splitting ───────────────────────────────────────────────
  const pages = splitPdfTextIntoPages(pdfText);
  const usablePages = pages.length > 1 ? pages : null; // treat 1-page as "not detected"

  if (usablePages && usablePages.length > 1) {
    const avgCharsPerPage = pdfText.length / usablePages.length;
    const pagesPerChunk = Math.max(1, Math.floor(charBudget / avgCharsPerPage));

    if (pagesPerChunk >= usablePages.length) return null; // fits without chunking

    return buildPageChunks(usablePages, pagesPerChunk, options);
  }

  // ── Fallback: char-based splitting ────────────────────────────────────────
  // No page boundaries detected. Split into fixed character windows.
  return buildCharChunks(pdfText, charBudget, options);
}

// ─── Page-based chunking ───────────────────────────────────────────────────────

function buildPageChunks(
  pages: string[],
  pagesPerChunk: number,
  options: BuildChunksOptions,
): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  let pageOffset = 0;
  const totalPages = pages.length;

  while (pageOffset < totalPages) {
    const slice = pages.slice(pageOffset, pageOffset + pagesPerChunk);
    const pageNumbers = slice.map((_, i) => pageOffset + i + 1);
    chunks.push(buildChunkObject(slice.join('\n\n---\n\n'), pageNumbers, chunks.length + 1, options));
    pageOffset += pagesPerChunk;
  }

  const total = chunks.length;
  chunks.forEach((c) => (c.totalChunks = total));
  return chunks;
}

// ─── Char-based chunking ──────────────────────────────────────────────────────

function buildCharChunks(
  pdfText: string,
  charBudget: number,
  options: BuildChunksOptions,
): PdfChunk[] | null {
  if (charBudget <= 0) return null;

  const chunks: PdfChunk[] = [];
  let offset = 0;
  let chunkIdx = 1;

  while (offset < pdfText.length) {
    const slice = pdfText.slice(offset, offset + charBudget);
    // Use a dummy page range for char-based chunks (page numbers unknown)
    const pageNumbers = [chunkIdx];
    chunks.push(buildChunkObject(slice, pageNumbers, chunkIdx, options));
    offset += charBudget;
    chunkIdx++;
  }

  if (chunks.length <= 1) return null; // fits in one call after all

  const total = chunks.length;
  chunks.forEach((c) => (c.totalChunks = total));
  return chunks;
}

// ─── Common chunk builder ─────────────────────────────────────────────────────

function buildChunkObject(
  text: string,
  pageNumbers: number[],
  chunkIdx: number,
  options: BuildChunksOptions,
): PdfChunk {
  const minPage = pageNumbers[0];
  const maxPage = pageNumbers[pageNumbers.length - 1];

  let visionImages: PdfChunk['visionImages'];
  let imageDescriptions: string | undefined;

  if (options.pdfImages && options.pdfImages.length > 0) {
    // Filter by page range AND only include images with meaningful content
    const chunkImages = options.pdfImages.filter(
      (img) =>
        img.pageNumber >= minPage &&
        img.pageNumber <= maxPage &&
        img.hasContent !== false,
    );

    if (options.imageMapping) {
      const withSrc = chunkImages.filter((img) => options.imageMapping![img.id]);

      // CRITICAL FIX: Limit vision images to MAX_VISION_IMAGES to prevent token overflow
      // Each base64 image consumes ~1350 tokens after resize (512px max-side)
      // For 16k context models, 3 images = ~4050 tokens (safe limit)
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));

      // Images beyond MAX_VISION_IMAGES are converted to text descriptions
      const withoutSrc = chunkImages.filter((img) => !options.imageMapping![img.id]);
      const allTextDescriptions = [...textOnlySlice, ...withoutSrc];
      if (allTextDescriptions.length > 0) {
        imageDescriptions = allTextDescriptions
          .map((img) => `- ${img.id}: page ${img.pageNumber}`)
          .join('\n');
      }
    } else {
      imageDescriptions = chunkImages.map((img) => `- ${img.id}: page ${img.pageNumber}`).join('\n');
    }
  }

  return {
    chunkIndex: chunkIdx,
    totalChunks: 0, // filled in after all chunks built
    text,
    pageNumbers,
    visionImages: visionImages?.length ? visionImages : undefined,
    imageDescriptions: imageDescriptions || undefined,
  };
}
