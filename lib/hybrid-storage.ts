/**
 * Hybrid Storage - IndexedDB (本地缓存) + MySQL (云端存储)
 *
 * 架构：
 * - 读取：优先从 IndexedDB 读取，为空时回退到 MySQL
 * - 写入：同时写入 IndexedDB 和 MySQL (异步)
 * - 优点：本地快速访问 + 云端持久化 + 跨设备同步
 */

import { db as indexedDB } from '@/lib/utils/database';
import type { SceneType } from '@/lib/types/stage';
import type {
  StageRecord,
  SceneRecord,
  MediaFileRecord,
  AudioFileRecord,
  ImageFileRecord,
  ChatSessionRecord,
  PlaybackStateRecord,
  StageOutlinesRecord,
  GeneratedAgentRecord,
  Snapshot,
} from './db-types';

// ==================== 同步状态 ====================

interface SyncStatus {
  lastSyncAt: number;
  pendingChanges: string[];
}

const SYNC_STATUS_KEY = 'hybrid-sync-status';
const LAST_USER_KEY = 'hybrid-last-userId';

function getSyncStatus(): SyncStatus {
  try {
    const stored = localStorage.getItem(SYNC_STATUS_KEY);
    return stored ? JSON.parse(stored) : { lastSyncAt: 0, pendingChanges: [] };
  } catch {
    return { lastSyncAt: 0, pendingChanges: [] };
  }
}

function setSyncStatus(status: SyncStatus): void {
  try {
    localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage errors
  }
}

/**
 * 检测用户是否已切换。如果切换了，清理旧的 IndexedDB 缓存。
 */
async function handleUserSwitch(userId: string): Promise<void> {
  try {
    const lastUserId = localStorage.getItem(LAST_USER_KEY);
    if (lastUserId && lastUserId !== userId) {
      console.log(`[HybridStorage] User switched: ${lastUserId} -> ${userId}, clearing local cache`);
      // 清理旧用户在本地的数据缓存
      await indexedDB.stages.clear();
      await indexedDB.scenes.clear();
      await indexedDB.chatSessions.clear();
      await indexedDB.stageOutlines.clear();
      await indexedDB.generatedAgents.clear();
      await indexedDB.playbackState.clear();
      // 注意：不清理 mediaFiles / audioFiles / imageFiles，它们体积大且与用户关联较弱
    }
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Ignore
  }
}

// ==================== MySQL 读取辅助函数 ====================

async function fetchFromMySQL<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const result = await res.json();
    if (!result.success) return null;
    return result.data as T;
  } catch (err) {
    console.warn('[HybridStorage] MySQL fetch failed:', url, err);
    return null;
  }
}

// ==================== Stage 存储 ====================

export async function listStages(userId: string): Promise<StageRecord[]> {
  // 检测用户切换
  await handleUserSwitch(userId);

  // 从 IndexedDB 读取并按 userId 过滤
  const localStages = await indexedDB.stages.toArray();
  const userStages = localStages.filter((s) => {
    const sUserId = (s as any).userId;
    // 匹配 userId，或者兼容没有 userId 的旧数据
    return !sUserId || sUserId === userId || sUserId === 'local' || sUserId === 'anonymous';
  });

  // 如果本地有数据，直接返回
  if (userStages.length > 0) {
    return userStages.map((s) => ({
      id: s.id,
      userId: (s as any).userId || 'local',
      name: s.name,
      description: s.description,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      language: s.language,
      style: s.style,
      currentSceneId: s.currentSceneId,
      agentIds: s.agentIds,
    }));
  }

  // IndexedDB 为空，回退到 MySQL
  console.log('[HybridStorage] IndexedDB empty for user, fetching from MySQL:', userId);
  const remoteStages = await fetchFromMySQL<StageRecord[]>(`/api/db/stage?userId=${encodeURIComponent(userId)}`);
  if (!remoteStages || remoteStages.length === 0) return [];

  // 缓存到 IndexedDB
  for (const stage of remoteStages) {
    await indexedDB.stages.put({
      id: stage.id,
      userId: stage.userId,
      name: stage.name,
      description: stage.description,
      createdAt: stage.createdAt,
      updatedAt: stage.updatedAt,
      language: stage.language,
      style: stage.style,
      currentSceneId: stage.currentSceneId,
      agentIds: stage.agentIds,
    });

    // 同步拉取该 stage 的 scenes 到 IndexedDB
    const remoteScenes = await fetchFromMySQL<SceneRecord[]>(`/api/db/scene?stageId=${stage.id}`);
    if (remoteScenes && remoteScenes.length > 0) {
      for (const scene of remoteScenes) {
        await indexedDB.scenes.put(scene);
      }
    }
  }

  console.log(`[HybridStorage] Synced ${remoteStages.length} stages from MySQL to IndexedDB`);
  return remoteStages;
}

export async function getStage(stageId: string): Promise<StageRecord | null> {
  const stage = await indexedDB.stages.get(stageId);
  if (stage) {
    return {
      id: stage.id,
      userId: (stage as any).userId || 'local',
      name: stage.name,
      description: stage.description,
      createdAt: stage.createdAt,
      updatedAt: stage.updatedAt,
      language: stage.language,
      style: stage.style,
      currentSceneId: stage.currentSceneId,
      agentIds: stage.agentIds,
    };
  }

  // 回退到 MySQL
  const remoteStage = await fetchFromMySQL<StageRecord>(`/api/db/stage?stageId=${stageId}`);
  if (!remoteStage) return null;

  // 缓存到 IndexedDB
  await indexedDB.stages.put({
    id: remoteStage.id,
    userId: remoteStage.userId,
    name: remoteStage.name,
    description: remoteStage.description,
    createdAt: remoteStage.createdAt,
    updatedAt: remoteStage.updatedAt,
    language: remoteStage.language,
    style: remoteStage.style,
    currentSceneId: remoteStage.currentSceneId,
    agentIds: remoteStage.agentIds,
  });
  return remoteStage;
}

export async function createStage(record: StageRecord): Promise<void> {
  // 写入 IndexedDB
  await indexedDB.stages.put({
    id: record.id,
    userId: record.userId,
    name: record.name,
    description: record.description,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    language: record.language,
    style: record.style,
    currentSceneId: record.currentSceneId,
    agentIds: record.agentIds,
  });

  // Await MySQL create so agents/scenes don't race ahead of the stage row (FK).
  if (record.userId && record.userId !== 'anonymous') {
    try {
      await syncToMySQL('stage', 'create', record);
    } catch (err) {
      console.warn('MySQL sync failed for stage:', err);
      throw err;
    }
  }
}

export async function updateStage(stageId: string, updates: Partial<StageRecord>): Promise<void> {
  // 更新 IndexedDB
  await indexedDB.stages.update(stageId, {
    ...updates,
    updatedAt: Date.now(),
  });

  // Include userId when available so server can recreate a missing MySQL row.
  const local = await indexedDB.stages.get(stageId);
  const userId = updates.userId || (local as any)?.userId;
  syncToMySQL('stage', 'update', { id: stageId, ...(userId ? { userId } : {}), ...updates }).catch(
    (err) => {
      console.warn('MySQL sync failed for stage update:', err);
    },
  );
}

export async function deleteStage(stageId: string): Promise<void> {
  // 删除 IndexedDB
  await indexedDB.stages.delete(stageId);
  await indexedDB.scenes.where('stageId').equals(stageId).delete();

  // 异步同步到 MySQL
  syncToMySQL('stage', 'delete', { id: stageId }).catch((err) => {
    console.warn('MySQL sync failed for stage delete:', err);
  });
}

// ==================== Scene 存储 ====================

export async function getScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  const scenes = await indexedDB.scenes.where('stageId').equals(stageId).sortBy('order');

  if (scenes.length > 0) {
    return scenes.map((s) => ({
      id: s.id,
      stageId: s.stageId,
      type: s.type,
      title: s.title,
      order: s.order,
      content: s.content,
      actions: s.actions,
      whiteboard: s.whiteboard,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  // 回退到 MySQL
  const remoteScenes = await fetchFromMySQL<SceneRecord[]>(`/api/db/scene?stageId=${stageId}`);
  if (!remoteScenes || remoteScenes.length === 0) return [];

  // 缓存到 IndexedDB
  for (const scene of remoteScenes) {
    await indexedDB.scenes.put(scene);
  }
  return remoteScenes;
}

export async function createScene(record: SceneRecord): Promise<void> {
  await indexedDB.scenes.put(record);

  syncToMySQL('scene', 'create', record).catch((err) => {
    console.warn('MySQL sync failed for scene:', err);
  });
}

export async function updateScene(sceneId: string, updates: Partial<SceneRecord>): Promise<void> {
  await indexedDB.scenes.update(sceneId, {
    ...updates,
    updatedAt: Date.now(),
  });

  syncToMySQL('scene', 'update', { id: sceneId, ...updates }).catch((err) => {
    console.warn('MySQL sync failed for scene update:', err);
  });
}

export async function deleteScene(sceneId: string): Promise<void> {
  await indexedDB.scenes.delete(sceneId);

  syncToMySQL('scene', 'delete', { id: sceneId }).catch((err) => {
    console.warn('MySQL sync failed for scene delete:', err);
  });
}

export async function deleteScenesByStageId(stageId: string): Promise<void> {
  await indexedDB.scenes.where('stageId').equals(stageId).delete();

  syncToMySQL('scene', 'deleteByStage', { stageId }).catch((err) => {
    console.warn('MySQL sync failed for scenes delete:', err);
  });
}

// ==================== Media 存储 ====================

export function mediaFileKey(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}

export async function getMediaFile(id: string): Promise<MediaFileRecord | null> {
  const media = await indexedDB.mediaFiles.get(id);
  if (!media) return null;

  return {
    id: media.id,
    stageId: media.stageId,
    type: media.type,
    blob: media.blob,
    mimeType: media.mimeType,
    size: media.size,
    poster: media.poster,
    prompt: media.prompt,
    params: media.params,
    error: media.error,
    errorCode: media.errorCode,
    createdAt: media.createdAt,
  };
}

export async function getMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
  const files = await indexedDB.mediaFiles.where('stageId').equals(stageId).toArray();
  return files.map((f) => ({
    id: f.id,
    stageId: f.stageId,
    type: f.type,
    blob: f.blob,
    mimeType: f.mimeType,
    size: f.size,
    poster: f.poster,
    prompt: f.prompt,
    params: f.params,
    error: f.error,
    errorCode: f.errorCode,
    createdAt: f.createdAt,
  }));
}

export async function saveMediaFile(record: MediaFileRecord): Promise<void> {
  await indexedDB.mediaFiles.put(record);

  syncToMySQL('media', 'save', record).catch((err) => {
    console.warn('MySQL sync failed for media:', err);
  });
}

export async function updateMediaFile(
  id: string,
  updates: Partial<MediaFileRecord>,
): Promise<void> {
  await indexedDB.mediaFiles.update(id, updates);

  syncToMySQL('media', 'update', { id, ...updates }).catch((err) => {
    console.warn('MySQL sync failed for media update:', err);
  });
}

export async function deleteMediaFile(id: string): Promise<void> {
  await indexedDB.mediaFiles.delete(id);

  syncToMySQL('media', 'delete', { id }).catch((err) => {
    console.warn('MySQL sync failed for media delete:', err);
  });
}

// ==================== Audio 存储 ====================

export async function getAudioFile(id: string): Promise<AudioFileRecord | null> {
  const audio = await indexedDB.audioFiles.get(id);
  if (!audio) return null;

  return {
    id: audio.id,
    blob: audio.blob,
    duration: audio.duration,
    format: audio.format,
    text: audio.text,
    voice: audio.voice,
    ossKey: audio.ossKey,
    createdAt: audio.createdAt,
  };
}

export async function saveAudioFile(record: AudioFileRecord): Promise<void> {
  await indexedDB.audioFiles.put(record);

  syncToMySQL('audio', 'save', record).catch((err) => {
    console.warn('MySQL sync failed for audio:', err);
  });
}

export async function deleteAudioFile(id: string): Promise<void> {
  await indexedDB.audioFiles.delete(id);

  syncToMySQL('audio', 'delete', { id }).catch((err) => {
    console.warn('MySQL sync failed for audio delete:', err);
  });
}

// ==================== Image 存储 ====================

export async function getImageFile(id: string): Promise<ImageFileRecord | null> {
  const image = await indexedDB.imageFiles.get(id);
  if (!image) return null;

  return {
    id: image.id,
    blob: image.blob,
    filename: image.filename,
    mimeType: image.mimeType,
    size: image.size,
    createdAt: image.createdAt,
  };
}

export async function saveImageFile(record: ImageFileRecord): Promise<void> {
  await indexedDB.imageFiles.put(record);

  syncToMySQL('image', 'save', record).catch((err) => {
    console.warn('MySQL sync failed for image:', err);
  });
}

export async function deleteImageFile(id: string): Promise<void> {
  await indexedDB.imageFiles.delete(id);

  syncToMySQL('image', 'delete', { id }).catch((err) => {
    console.warn('MySQL sync failed for image delete:', err);
  });
}

// ==================== Generated Agent 存储 ====================

export async function getGeneratedAgentsByStageId(stageId: string): Promise<any[]> {
  const local = await indexedDB.generatedAgents.where('stageId').equals(stageId).toArray();
  if (local.length > 0) return local;

  // 回退到 MySQL
  const remoteAgents = await fetchFromMySQL<GeneratedAgentRecord[]>(`/api/db/agent?stageId=${stageId}`);
  if (!remoteAgents || remoteAgents.length === 0) return [];

  // 缓存到 IndexedDB
  for (const agent of remoteAgents) {
    await indexedDB.generatedAgents.put(agent);
  }
  return remoteAgents;
}

export async function saveGeneratedAgent(record: any): Promise<void> {
  await indexedDB.generatedAgents.put(record);

  syncToMySQL('agent', 'save', record).catch((err) => {
    console.warn('MySQL sync failed for agent:', err);
  });
}

export async function deleteGeneratedAgent(id: string): Promise<void> {
  await indexedDB.generatedAgents.delete(id);

  syncToMySQL('agent', 'delete', { id }).catch((err) => {
    console.warn('MySQL sync failed for agent delete:', err);
  });
}

export async function deleteGeneratedAgentsByStageId(stageId: string): Promise<void> {
  await indexedDB.generatedAgents.where('stageId').equals(stageId).delete();

  syncToMySQL('agent', 'deleteByStage', { stageId }).catch((err) => {
    console.warn('MySQL sync failed for agents delete:', err);
  });
}

// ==================== Stage Outlines ====================

export async function getStageOutlines(stageId: string): Promise<{ outlines: any[] } | null> {
  const record = await indexedDB.stageOutlines.get(stageId);
  if (record) return { outlines: record.outlines };

  // 回退到 MySQL
  const remote = await fetchFromMySQL<StageOutlinesRecord>(`/api/db/outlines?stageId=${stageId}`);
  if (!remote) return null;

  // 缓存到 IndexedDB
  await indexedDB.stageOutlines.put({
    stageId: remote.stageId,
    outlines: remote.outlines,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  });
  return { outlines: remote.outlines };
}

export async function saveStageOutlines(record: {
  stageId: string;
  outlines: any[];
}): Promise<void> {
  await indexedDB.stageOutlines.put({
    stageId: record.stageId,
    outlines: record.outlines,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  syncToMySQL('outlines', 'save', record).catch((err) => {
    console.warn('MySQL sync failed for outlines:', err);
  });
}

export async function deleteStageOutlines(stageId: string): Promise<void> {
  await indexedDB.stageOutlines.delete(stageId);

  syncToMySQL('outlines', 'delete', { stageId }).catch((err) => {
    console.warn('MySQL sync failed for outlines delete:', err);
  });
}

// ==================== Snapshot 存储 ====================

export async function getSnapshots(): Promise<any[]> {
  return indexedDB.snapshots.orderBy('id').toArray();
}

export async function saveSnapshot(snapshot: { index: number; slides: any[] }): Promise<number> {
  const id = await indexedDB.snapshots.add(snapshot);
  return id ?? 0;
}

export async function deleteSnapshot(id: number): Promise<void> {
  await indexedDB.snapshots.delete(id);
}

export async function clearSnapshots(): Promise<void> {
  await indexedDB.snapshots.clear();
}

// ==================== First Slide ====================

export async function getFirstSlideByStages(stageIds: string[]): Promise<Record<string, any>> {
  const result: Record<string, any> = {};

  for (const stageId of stageIds) {
    const scenes = await indexedDB.scenes.where('stageId').equals(stageId).sortBy('order');
    const firstSlide = scenes.find((s) => s.content?.type === 'slide');
    if (firstSlide && firstSlide.content.type === 'slide') {
      result[stageId] = firstSlide.content.canvas;
    }
  }

  return result;
}

// ==================== 级联删除 ====================

export async function deleteStageWithRelatedData(stageId: string): Promise<void> {
  // 删除 IndexedDB 所有相关数据
  await indexedDB.transaction(
    'rw',
    [
      indexedDB.stages,
      indexedDB.scenes,
      indexedDB.chatSessions,
      indexedDB.playbackState,
      indexedDB.stageOutlines,
      indexedDB.mediaFiles,
      indexedDB.generatedAgents,
    ],
    async () => {
      await indexedDB.stages.delete(stageId);
      await indexedDB.scenes.where('stageId').equals(stageId).delete();
      await indexedDB.chatSessions.where('stageId').equals(stageId).delete();
      await indexedDB.playbackState.delete(stageId);
      await indexedDB.stageOutlines.delete(stageId);
      await indexedDB.mediaFiles.where('stageId').equals(stageId).delete();
      await indexedDB.generatedAgents.where('stageId').equals(stageId).delete();
    },
  );

  // 异步同步到 MySQL
  syncToMySQL('stage', 'deleteWithRelated', { stageId }).catch((err) => {
    console.warn('MySQL sync failed for stage cascade delete:', err);
  });
}

// ==================== MySQL 同步 (后台异步) ====================

// ==================== ChatSession 存储 ====================

export async function getChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
  const local = await indexedDB.chatSessions.where('stageId').equals(stageId).toArray();
  if (local.length > 0) return local;

  // 回退到 MySQL
  const remoteSessions = await fetchFromMySQL<ChatSessionRecord[]>(`/api/db/chat?stageId=${stageId}`);
  if (!remoteSessions || remoteSessions.length === 0) return [];

  // 缓存到 IndexedDB
  for (const session of remoteSessions) {
    await indexedDB.chatSessions.put(session as any);
  }
  return remoteSessions;
}

export async function createChatSession(record: ChatSessionRecord): Promise<void> {
  await indexedDB.chatSessions.put(record as any);

  syncToMySQL('chat', 'create', record).catch((err) => {
    console.warn('MySQL sync failed for chat session:', err);
  });
}

export async function updateChatSession(
  sessionId: string,
  updates: Partial<ChatSessionRecord>,
): Promise<void> {
  await indexedDB.chatSessions.update(sessionId, {
    ...updates,
    updatedAt: Date.now(),
  });

  syncToMySQL('chat', 'update', { id: sessionId, ...updates }).catch((err) => {
    console.warn('MySQL sync failed for chat session update:', err);
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await indexedDB.chatSessions.delete(sessionId);

  syncToMySQL('chat', 'delete', { id: sessionId }).catch((err) => {
    console.warn('MySQL sync failed for chat session delete:', err);
  });
}

async function syncToMySQL(entity: string, action: string, data: any): Promise<void> {
  try {
    const res = await fetch(`/api/db/${entity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
    });

    const text = await res.text();
    let result: { success?: boolean; error?: string } = {};
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 200) || `Invalid JSON (${res.status})`);
      }
    }
    if (!res.ok || !result.success) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    // 更新同步状态
    const status = getSyncStatus();
    status.lastSyncAt = Date.now();
    setSyncStatus(status);
  } catch (error) {
    console.error(`MySQL sync error [${entity}.${action}]:`, error);
    throw error;
  }
}

// ==================== 清空数据库 ====================

export async function clearDatabase(): Promise<void> {
  await indexedDB.delete();
  localStorage.clear();
  sessionStorage.clear();
}

// ==================== 统计信息 ====================

export async function getDatabaseStats() {
  const [
    stages,
    scenes,
    audioFiles,
    imageFiles,
    snapshots,
    chatSessions,
    playbackStates,
    stageOutlines,
    mediaFiles,
    generatedAgents,
  ] = await Promise.all([
    indexedDB.stages.count(),
    indexedDB.scenes.count(),
    indexedDB.audioFiles.count(),
    indexedDB.imageFiles.count(),
    indexedDB.snapshots.count(),
    indexedDB.chatSessions.count(),
    indexedDB.playbackState.count(),
    indexedDB.stageOutlines.count(),
    indexedDB.mediaFiles.count(),
    indexedDB.generatedAgents.count(),
  ]);

  return {
    stages,
    scenes,
    audioFiles,
    imageFiles,
    snapshots,
    chatSessions,
    playbackStates,
    stageOutlines,
    mediaFiles,
    generatedAgents,
  };
}
