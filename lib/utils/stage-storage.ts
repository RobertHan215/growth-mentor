/**
 * Stage Storage Manager
 *
 * Hybrid storage: IndexedDB (本地缓存) + MySQL (云端存储)
 */

import { Stage, Scene } from '../types/stage';
import { ChatSession } from '../types/chat';
import {
  listStages as hybridListStages,
  getStage as hybridGetStage,
  createStage as hybridCreateStage,
  deleteStageWithRelatedData as hybridDeleteStage,
  getScenesByStageId as hybridGetScenes,
  createScene as hybridCreateScene,
  deleteScene as hybridDeleteScene,
  getFirstSlideByStages as hybridGetFirstSlide,
  getStageOutlines as hybridGetOutlines,
  saveStageOutlines as hybridSaveOutlines,
  deleteStageOutlines as hybridDeleteOutlines,
  getMediaFilesByStageId as hybridGetMediaFiles,
} from '../hybrid-storage';
import type { StageRecord } from '../db-types';
import { saveChatSessions, loadChatSessions, deleteChatSessions } from './chat-storage';
import { clearPlaybackState } from './playback-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  chats: ChatSession[];
}

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  supportedModes?: string[];
  learningMode?: 'teaching' | 'oneOnOne';
  coverImage?: string;
}

/**
 * Save stage data to hybrid storage (IndexedDB + MySQL)
 */
export async function saveStageData(
  stageId: string,
  data: StageStoreData,
  userId: string,
): Promise<void> {
  try {
    const now = Date.now();

    const existingStage = await hybridGetStage(stageId);

    // Always upsert full stage (server create is upsert + awaited). Avoids the
    // IndexedDB-hit → MySQL update-miss path after a prior failed create.
    await hybridCreateStage({
      id: stageId,
      userId,
      name: data.stage.name || 'Untitled Stage',
      description: data.stage.description,
      createdAt: data.stage.createdAt || existingStage?.createdAt || now,
      updatedAt: now,
      language: data.stage.language,
      style: data.stage.style,
      // Never persist the transient pending placeholder as the current scene.
      currentSceneId:
        data.currentSceneId && data.currentSceneId !== '__pending__'
          ? data.currentSceneId
          : data.scenes?.[0]?.id || existingStage?.currentSceneId || undefined,
      agentIds: data.stage.agentIds,
      learningMode: data.stage.learningMode,
    });

    // Upsert scenes in place. Do NOT delete-all first — that leaves IndexedDB empty
    // mid-save and loadFromStorage can wipe in-memory scenes (blank classroom).
    const keepIds = new Set<string>();
    if (data.scenes && data.scenes.length > 0) {
      for (let index = 0; index < data.scenes.length; index++) {
        const scene = data.scenes[index];
        keepIds.add(scene.id);
        await hybridCreateScene({
          ...scene,
          stageId,
          order: scene.order ?? index,
          createdAt: scene.createdAt || now,
          updatedAt: scene.updatedAt || now,
        });
      }
    }

    // Drop scenes removed from the stage (only when we have a non-empty keep set,
    // so an early empty save for a brand-new stage doesn't thrash).
    if (keepIds.size > 0) {
      const localScenes = await hybridGetScenes(stageId);
      for (const local of localScenes) {
        if (!keepIds.has(local.id)) {
          await hybridDeleteScene(local.id);
        }
      }
    }

    if (data.chats) {
      await saveChatSessions(stageId, data.chats);
    }

    log.info(`Saved stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to save stage:', error);
    throw error;
  }
}

/**
 * Load stage data from hybrid storage
 */
export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  try {
    const stage = await hybridGetStage(stageId);
    if (!stage) {
      log.info(`Stage not found: ${stageId}`);
      return null;
    }

    const scenes = await hybridGetScenes(stageId);

    const chats = await loadChatSessions(stageId);

    log.info(`Loaded stage: ${stageId}, scenes: ${scenes.length}, chats: ${chats.length}`);

    return {
      stage,
      scenes: scenes as Scene[],
      currentSceneId: stage.currentSceneId || scenes[0]?.id || null,
      chats,
    };
  } catch (error) {
    log.error('Failed to load stage:', error);
    return null;
  }
}

/**
 * Delete stage and all related data
 */
export async function deleteStageData(stageId: string): Promise<void> {
  try {
    await hybridDeleteStage(stageId);
    await deleteChatSessions(stageId);
    await clearPlaybackState(stageId);

    log.info(`Deleted stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to delete stage:', error);
    throw error;
  }
}

/**
 * List all stages for a user
 */
export async function listStages(userId: string): Promise<StageListItem[]> {
  try {
    const stages = await hybridListStages(userId);

    const stageList: StageListItem[] = await Promise.all(
      stages.map(async (stage) => {
        const scenes = await hybridGetScenes(stage.id);

        return {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          sceneCount: scenes.length,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
          supportedModes: (stage.directorConfig as { supportedModes?: string[] } | undefined)?.supportedModes,
          learningMode: stage.learningMode,
          coverImage: stage.coverImage,
        };
      }),
    );

    return stageList;
  } catch (error) {
    log.error('Failed to list stages:', error);
    return [];
  }
}

/**
 * Get first slide scene's canvas data for each stage (for thumbnail preview).
 */
export async function getFirstSlideByStages(
  stageIds: string[],
): Promise<Record<string, import('../types/slides').Slide>> {
  const result: Record<string, import('../types/slides').Slide> = {};
  try {
    const stageSlideMap = await hybridGetFirstSlide(stageIds);

    for (const [stageId, scene] of Object.entries(stageSlideMap)) {
      if (scene.content?.type === 'slide') {
        const slide = structuredClone(scene.content.canvas);

        const placeholderEls = slide.elements.filter(
          (el: { type: string; src?: string }) =>
            el.type === 'image' && el.src && /^gen_(img|vid)_[\w-]+$/i.test(el.src),
        );

        if (placeholderEls.length > 0) {
          const mediaRecords = await hybridGetMediaFiles(stageId);
          const mediaMap = new Map(
            mediaRecords.map((r) => {
              const elementId = r.id.includes(':') ? r.id.split(':').slice(1).join(':') : r.id;
              return [elementId, r.blob] as const;
            }),
          );

          for (const el of placeholderEls as Array<{ src?: string }>) {
            if (el.src) {
              const blob = mediaMap.get(el.src);
              if (blob) {
                el.src = URL.createObjectURL(blob);
              } else {
                el.src = '';
              }
            }
          }
        }

        result[stageId] = slide;
      }
    }
  } catch (error) {
    log.error('Failed to load thumbnails:', error);
  }
  return result;
}

/**
 * Check if stage exists
 */
export async function stageExists(stageId: string): Promise<boolean> {
  try {
    const stage = await hybridGetStage(stageId);
    return !!stage;
  } catch (error) {
    log.error('Failed to check stage existence:', error);
    return false;
  }
}
