/**
 * Constants for PDF content generation
 * Shared between client and server code
 */

// PDF content truncation limit (characters)
export const MAX_PDF_CONTENT_CHARS = 50000;

// Maximum number of images to send as vision content parts
// Reduced from 15 to 3 to support models with small context windows (16k).
// Each image consumes ~1350 tokens after resize (512px), so 3 images = ~4050 tokens.
export const MAX_VISION_IMAGES = 3;

// Estimated tokens per vision image (512px max dimension, ~1 token per 14x14 pixel tile)
export const TOKENS_PER_VISION_IMAGE = 1350;
