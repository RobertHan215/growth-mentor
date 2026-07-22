/**
 * Media Generation Store
 *
 * Tracks per-element media generation status (pending → generating → done/failed).
 * Drives skeleton loading in slide renderer components.
 * Persistence is handled by MySQL (mediaFiles table).
 */

import { create } from 'zustand';
import type { MediaGenerationRequest } from '@/lib/media/types';
import {
  getMediaFilesByStageId,
  getMediaFile,
  saveMediaFile,
  updateMediaFile,
  mediaFileKey,
} from '@/lib/hybrid-storage';
import type { MediaFileRecord } from '@/lib/db-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaGenerationStore');

export type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed';

export interface MediaTask {
  elementId: string;
  type: 'image' | 'video';
  status: MediaTaskStatus;
  prompt: string;
  params: {
    aspectRatio?: string;
    style?: string;
    duration?: number;
  };
  objectUrl?: string;
  poster?: string;
  error?: string;
  errorCode?: string;
  retryCount: number;
  stageId: string;
}

interface MediaGenerationState {
  tasks: Record<string, MediaTask>;

  enqueueTasks: (stageId: string, requests: MediaGenerationRequest[]) => void;

  markGenerating: (elementId: string) => void;
  markDone: (elementId: string, objectUrl: string, poster?: string) => void;
  markFailed: (elementId: string, error: string, errorCode?: string) => void;

  markPendingForRetry: (elementId: string) => void;

  getTask: (elementId: string) => MediaTask | undefined;
  isReady: (elementId: string) => boolean;

  restoreFromDB: (stageId: string) => Promise<void>;

  clearStage: (stageId: string) => void;
  revokeObjectUrls: () => void;
}

export function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_[\w-]+$/i.test(src);
}

export const useMediaGenerationStore = create<MediaGenerationState>()((set, get) => ({
  tasks: {},

  enqueueTasks: (stageId, requests) => {
    const newTasks: Record<string, MediaTask> = {};
    for (const req of requests) {
      if (get().tasks[req.elementId]) continue;
      newTasks[req.elementId] = {
        elementId: req.elementId,
        type: req.type,
        status: 'pending',
        prompt: req.prompt,
        params: {
          aspectRatio: req.aspectRatio,
          style: req.style,
        },
        retryCount: 0,
        stageId,
      };
    }
    if (Object.keys(newTasks).length > 0) {
      set((s) => ({ tasks: { ...s.tasks, ...newTasks } }));
    }
  },

  markGenerating: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: { ...s.tasks, [elementId]: { ...task, status: 'generating' } },
      };
    }),

  markDone: (elementId, objectUrl, poster) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'done',
            objectUrl,
            poster,
            error: undefined,
          },
        },
      };
    }),

  markFailed: (elementId, error, errorCode) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: { ...task, status: 'failed', error, errorCode },
        },
      };
    }),

  markPendingForRetry: (elementId) =>
    set((s) => {
      const task = s.tasks[elementId];
      if (!task) return s;
      return {
        tasks: {
          ...s.tasks,
          [elementId]: {
            ...task,
            status: 'pending',
            error: undefined,
            errorCode: undefined,
            retryCount: task.retryCount + 1,
          },
        },
      };
    }),

  getTask: (elementId) => get().tasks[elementId],

  isReady: (elementId) => get().tasks[elementId]?.status === 'done',

  restoreFromDB: async (stageId) => {
    try {
      const records = await getMediaFilesByStageId(stageId);
      const restored: Record<string, MediaTask> = {};
      for (const rec of records) {
        const elementId = rec.id.includes(':') ? rec.id.split(':').slice(1).join(':') : rec.id;
        const params = JSON.parse(rec.params || '{}');

        if (rec.error) {
          restored[elementId] = {
            elementId,
            type: rec.type,
            status: 'failed',
            prompt: rec.prompt,
            params,
            error: rec.error,
            errorCode: rec.errorCode,
            retryCount: 0,
            stageId,
          };
        } else {
          const blob = new Blob([rec.blob], { type: rec.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          const poster = rec.poster ? URL.createObjectURL(new Blob([rec.poster])) : undefined;
          restored[elementId] = {
            elementId,
            type: rec.type,
            status: 'done',
            prompt: rec.prompt,
            params,
            objectUrl,
            poster,
            retryCount: 0,
            stageId,
          };
        }
      }
      if (Object.keys(restored).length > 0) {
        set((s) => ({ tasks: { ...s.tasks, ...restored } }));
      }
    } catch (err) {
      log.error('Failed to restore from DB:', err);
    }
  },

  clearStage: (stageId) =>
    set((s) => {
      const remaining: Record<string, MediaTask> = {};
      for (const [id, task] of Object.entries(s.tasks)) {
        if (task.stageId !== stageId) {
          remaining[id] = task;
        } else if (task.objectUrl) {
          URL.revokeObjectURL(task.objectUrl);
          if (task.poster) URL.revokeObjectURL(task.poster);
        }
      }
      return { tasks: remaining };
    }),

  revokeObjectUrls: () => {
    const tasks = get().tasks;
    for (const task of Object.values(tasks)) {
      if (task.objectUrl) URL.revokeObjectURL(task.objectUrl);
      if (task.poster) URL.revokeObjectURL(task.poster);
    }
  },
}));
