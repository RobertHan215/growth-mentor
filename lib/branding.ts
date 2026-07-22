/**
 * Branding Configuration
 *
 * Centralized branding constants loaded from environment variables.
 * All brand-related text and assets should reference this module
 * instead of hardcoding values.
 *
 * Environment variables (set in .env.local):
 *   NEXT_PUBLIC_APP_NAME       - Application name (default: "易鑫大学堂")
 *   NEXT_PUBLIC_APP_SUBTITLE   - Subtitle / tagline
 *   NEXT_PUBLIC_APP_DESCRIPTION - SEO description
 *   NEXT_PUBLIC_APP_LOGO       - Logo image path (default: "/logo-horizontal.png")
 */

/** Application display name */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || '易鑫大学堂';

/** Short tagline shown on login page */
export const APP_SUBTITLE = process.env.NEXT_PUBLIC_APP_SUBTITLE || `${APP_NAME} - AI互动课堂平台`;

/** SEO meta description */
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'AI互动课堂平台，将任何主题或文档转化为丰富的互动学习体验。';

/** Logo image path (relative to /public) */
export const APP_LOGO = process.env.NEXT_PUBLIC_APP_LOGO || '/logo-horizontal.png';

/** Prepend basePath to any asset path for use in img src attributes */
export const asset = (path: string): string => `${process.env.NEXT_PUBLIC_BASE_PATH || ''}${path}`;
