import { create } from 'zustand';
import { getSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots } from '@/lib/hybrid-storage';
import type { Snapshot } from '@/lib/db-types';
import { useStageStore } from './stage';
import type { Scene } from '@/lib/types/stage';

export interface SnapshotState {
  snapshotCursor: number;
  snapshotLength: number;

  canUndo: () => boolean;
  canRedo: () => boolean;

  setSnapshotCursor: (cursor: number) => void;
  setSnapshotLength: (length: number) => void;
  initSnapshotDatabase: () => Promise<void>;
  addSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshotCursor: -1,
  snapshotLength: 0,

  canUndo: () => get().snapshotCursor > 0,
  canRedo: () => get().snapshotCursor < get().snapshotLength - 1,

  setSnapshotCursor: (cursor: number) => set({ snapshotCursor: cursor }),
  setSnapshotLength: (length: number) => set({ snapshotLength: length }),

  initSnapshotDatabase: async () => {
    const stageStore = useStageStore.getState();

    await clearSnapshots();

    const newFirstSnapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    await saveSnapshot(newFirstSnapshot);

    set({
      snapshotCursor: 0,
      snapshotLength: 1,
    });
  },

  addSnapshot: async () => {
    const stageStore = useStageStore.getState();
    const { snapshotCursor, snapshotLength } = get();

    const snapshots = await getSnapshots();

    const needDeleteIds: number[] = [];

    if (snapshotCursor >= 0 && snapshotCursor < snapshots.length - 1) {
      for (let i = snapshotCursor + 1; i < snapshots.length; i++) {
        if (snapshots[i].id !== undefined) {
          needDeleteIds.push(snapshots[i].id!);
        }
      }
    }

    const snapshot = {
      index: stageStore.getSceneIndex(stageStore.currentSceneId || ''),
      slides: JSON.parse(JSON.stringify(stageStore.scenes)),
    };
    await saveSnapshot(snapshot);

    let newLength = snapshots.length - needDeleteIds.length + 1;

    const snapshotLengthLimit = 20;
    if (newLength > snapshotLengthLimit && snapshots.length > 0 && snapshots[0].id !== undefined) {
      needDeleteIds.push(snapshots[0].id!);
      newLength--;
    }

    if (newLength >= 2 && snapshots.length >= 2) {
      const prevSnapshot = snapshots[newLength - 2];
      if (prevSnapshot.id !== undefined) {
        const currentSceneIndex = stageStore.getSceneIndex(stageStore.currentSceneId || '');
        await saveSnapshot({
          ...prevSnapshot,
          index: currentSceneIndex,
        });
      }
    }

    for (const id of needDeleteIds) {
      await deleteSnapshot(id);
    }

    set({
      snapshotCursor: newLength - 1,
      snapshotLength: newLength,
    });
  },

  undo: async () => {
    const { snapshotCursor } = get();
    if (snapshotCursor <= 0) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor - 1;
    const snapshots: Snapshot[] = await getSnapshots();
    const snapshot = snapshots[newSnapshotCursor];
    if (!snapshot) return;

    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    stageStore.setScenes(slides as unknown as Scene[]);
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },

  redo: async () => {
    const { snapshotCursor, snapshotLength } = get();
    if (snapshotCursor >= snapshotLength - 1) return;

    const stageStore = useStageStore.getState();

    const newSnapshotCursor = snapshotCursor + 1;
    const snapshots: Snapshot[] = await getSnapshots();
    const snapshot = snapshots[newSnapshotCursor];
    if (!snapshot) return;

    const { index, slides } = snapshot;

    const sceneIndex = index > slides.length - 1 ? slides.length - 1 : index;

    stageStore.setScenes(slides as unknown as Scene[]);
    if (slides[sceneIndex]) {
      stageStore.setCurrentSceneId(slides[sceneIndex].id);
    }

    set({ snapshotCursor: newSnapshotCursor });
  },
}));
