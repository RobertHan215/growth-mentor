/**
 * Playback Storage - Persist playback engine state via IndexedDB + MySQL.
 *
 * Architecture (same as hybrid-storage.ts):
 * - Write: IndexedDB immediately (fast) + MySQL async via /api/db/playback
 * - Read:  IndexedDB first; if empty, fall back to MySQL API
 * - This keeps the module client-safe (no direct Prisma import) while
 *   still supporting cross-device persistence through the server API.
 */

import { db as indexedDB } from '@/lib/utils/database';

export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────

async function syncToMySQL(action: 'save' | 'delete', data: object): Promise<void> {
  try {
    const res = await fetch('/api/db/playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`[PlaybackStorage] MySQL sync failed (${action}):`, err);
    }
  } catch (err) {
    console.warn(`[PlaybackStorage] MySQL sync error (${action}):`, err);
  }
}

async function fetchFromMySQL(stageId: string): Promise<PlaybackSnapshot | null> {
  try {
    const res = await fetch(`/api/db/playback?stageId=${encodeURIComponent(stageId)}`);
    if (!res.ok) return null;
    const result = await res.json();
    if (!result.success || !result.data) return null;
    const d = result.data;
    return {
      sceneIndex: d.sceneIndex ?? 0,
      actionIndex: d.actionIndex ?? 0,
      consumedDiscussions: d.consumedDiscussions ?? [],
    };
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Save playback state for a stage.
 * Writes to IndexedDB immediately, then syncs to MySQL in the background.
 */
export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  const record = {
    stageId,
    sceneIndex: snapshot.sceneIndex,
    actionIndex: snapshot.actionIndex,
    consumedDiscussions: snapshot.consumedDiscussions,
    updatedAt: Date.now(),
  };

  // 1. 立即写入 IndexedDB（客户端缓存）
  await (indexedDB.playbackState as any).put(record);

  // 2. 后台异步同步到 MySQL（跨设备持久化）
  syncToMySQL('save', record).catch(() => {/* already logged inside */});
}

/**
 * Load playback state for a stage.
 * Reads from IndexedDB first, falls back to MySQL if not found locally.
 */
export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  // 1. 尝试从 IndexedDB 读取
  const local = await (indexedDB.playbackState as any).get(stageId);
  if (local) {
    return {
      sceneIndex: local.sceneIndex ?? 0,
      actionIndex: local.actionIndex ?? 0,
      consumedDiscussions: local.consumedDiscussions ?? [],
    };
  }

  // 2. 本地没有，回退到 MySQL API
  const remote = await fetchFromMySQL(stageId);
  if (remote) {
    // 缓存到 IndexedDB 供后续使用
    await (indexedDB.playbackState as any).put({
      stageId,
      sceneIndex: remote.sceneIndex,
      actionIndex: remote.actionIndex,
      consumedDiscussions: remote.consumedDiscussions,
      updatedAt: Date.now(),
    });
  }
  return remote;
}

/**
 * Clear playback state for a stage.
 * Deletes from both IndexedDB and MySQL.
 */
export async function clearPlaybackState(stageId: string): Promise<void> {
  // 1. 删除 IndexedDB
  await (indexedDB.playbackState as any).delete(stageId);

  // 2. 后台同步删除 MySQL
  syncToMySQL('delete', { stageId }).catch(() => {/* already logged inside */});
}
