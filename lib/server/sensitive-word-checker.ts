/**
 * Sensitive Word Checker (Server-side only)
 *
 * Loads all enabled sensitive words from DB and checks text for matches.
 * Results are cached in-process for CACHE_TTL_MS to reduce DB round-trips.
 *
 * Usage:
 *   const result = await checkSensitiveWords(text, userId, 'user');
 *   if (result.hit) throw ...;
 */

import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('SensitiveWordChecker');

const CACHE_TTL_MS = 30_000; // 30 seconds in-memory cache

interface CacheEntry {
  words: Array<{ id: string; word: string; category: string }>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/** Load enabled words from DB (with in-process cache). */
async function loadEnabledWords(): Promise<Array<{ id: string; word: string; category: string }>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.words;
  }

  const words = await prisma.sensitiveWord.findMany({
    where: { enabled: true },
    select: { id: true, word: true, category: true },
  });

  cache = { words, expiresAt: now + CACHE_TTL_MS };
  log.debug(`Loaded ${words.length} sensitive words (cache refreshed)`);
  return words;
}

/** Invalidate cache immediately (call after admin CRUD operations). */
export function invalidateSensitiveWordCache(): void {
  cache = null;
}

export interface SensitiveWordCheckResult {
  hit: boolean;
  wordId?: string;
  matched?: string;
  category?: string;
  matches?: SensitiveWordMatch[];
}

export interface SensitiveWordMatch {
  wordId: string;
  matched: string;
  category?: string;
}

/**
 * Check if `text` contains any enabled sensitive word (case-insensitive substring match).
 * If a match is found and `userId` is provided, a log entry is written to DB.
 *
 * @param text     - Text to check
 * @param userId   - ID of the user whose message is being checked (for logging)
 * @param source   - 'user' | 'ai'
 */
export async function checkSensitiveWords(
  text: string,
  userId?: string,
  source: 'user' | 'ai' = 'user',
): Promise<SensitiveWordCheckResult> {
  if (!text || text.trim().length === 0) {
    return { hit: false };
  }

  const words = await loadEnabledWords();
  const lowerText = text.toLowerCase();
  const matches: SensitiveWordMatch[] = [];

  for (const { id, word, category } of words) {
    const normalizedWord = word.trim();
    if (!normalizedWord) continue;

    if (lowerText.includes(normalizedWord.toLowerCase())) {
      log.info(
        `Sensitive word hit: "${normalizedWord}" (source=${source}, userId=${userId ?? 'unknown'})`,
      );
      const normalizedCategory = category.trim();
      matches.push({
        wordId: id,
        matched: normalizedWord,
        ...(normalizedCategory ? { category: normalizedCategory } : {}),
      });

      // Write audit log (fire-and-forget, don't block the response)
      if (userId) {
        const snippet = text.length > 100 ? text.slice(0, 100) + '…' : text;
        prisma.sensitiveWordLog
          .create({
            data: {
              wordId: id,
              word: normalizedWord,
              userId,
              source,
              messageSnippet: snippet,
            },
          })
          .catch((err) => log.error('Failed to write sensitive word log:', err));
      }
    }
  }

  if (matches.length > 0) {
    const first = matches[0];
    return {
      hit: true,
      wordId: first.wordId,
      matched: first.matched,
      ...(first.category ? { category: first.category } : {}),
      matches,
    };
  }

  return { hit: false };
}
