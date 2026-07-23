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
 *   NEXT_PUBLIC_BASE_PATH      - Optional URL prefix (e.g. "/training-hub")
 */

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

/** Application display name */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || '易鑫大学堂';

/** Short tagline shown on login page */
export const APP_SUBTITLE = process.env.NEXT_PUBLIC_APP_SUBTITLE || `${APP_NAME} - AI互动课堂平台`;

/** SEO meta description */
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'AI互动课堂平台，将任何主题或文档转化为丰富的互动学习体验。';

/**
 * Prepend basePath to app-relative paths for img src / href / fetch.
 * Idempotent; leaves http(s)/data/blob URLs untouched.
 */
export function asset(path: string): string {
  if (!path) return path;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (!BASE_PATH) return path.startsWith('/') ? path : `/${path}`;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return path.startsWith('/') ? `${BASE_PATH}${path}` : `${BASE_PATH}/${path}`;
}

/** Logo image path (relative to /public), already basePath-aware */
export const APP_LOGO = asset(process.env.NEXT_PUBLIC_APP_LOGO || '/logo-horizontal.png');

/** Default course cover when a course has no coverImage set */
export const DEFAULT_COURSE_COVER = asset('/course-cover-default.jpg');

/**
 * Client-only: make bare fetch('/api/...') and fetch('/avatars/...') honor basePath.
 * Must run before any client fetch — import this module from a root client provider.
 */
export function installBasePathFetch(): void {
  if (typeof window === 'undefined' || !BASE_PATH) return;
  const w = window as Window & { __basePathFetchInstalled?: boolean };
  if (w.__basePathFetchInstalled) return;
  w.__basePathFetchInstalled = true;

  const raw = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === 'string' && input.startsWith('/') && !input.startsWith(`${BASE_PATH}/`) && input !== BASE_PATH) {
      return raw(`${BASE_PATH}${input}`, init);
    }
    if (input instanceof Request) {
      try {
        const u = new URL(input.url);
        if (
          u.origin === window.location.origin &&
          !u.pathname.startsWith(`${BASE_PATH}/`) &&
          u.pathname !== BASE_PATH
        ) {
          return raw(new Request(`${BASE_PATH}${u.pathname}${u.search}${u.hash}`, input), init);
        }
      } catch {
        // fall through
      }
    }
    return raw(input, init);
  };
}

// Install as soon as any client module imports branding (AuthProvider does).
installBasePathFetch();
