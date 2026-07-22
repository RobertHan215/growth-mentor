'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { ModeSelector, type ClassroomMode } from '@/components/one-on-one/mode-selector';
import { OneOnOneStage } from '@/components/one-on-one/one-on-one-stage';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { deriveLearningMode } from '@/lib/training/course-learning-mode';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ClassroomMode>('selecting');
  const [supportedModes, setSupportedModes] = useState<('teaching' | 'oneOnOne')[] | undefined>(undefined);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      // Step 1: ALWAYS check visibility from server first (even if local cache exists)
      // This ensures revoked permissions take effect immediately
      try {
        const visibilityRes = await fetch(`/api/db/stage?stageId=${encodeURIComponent(classroomId)}`);
        if (visibilityRes.status === 403) {
          throw new Error('NO_PERMISSION');
        }
      } catch (visErr) {
        if (visErr instanceof Error && visErr.message === 'NO_PERMISSION') throw visErr;
        log.warn('[Classroom] Visibility check failed:', visErr);
      }

      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (file-based → MySQL)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);

        // Tier 2: File-based classroom storage (data/classrooms/{id}.json)
        let loaded = false;
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('Loaded from file-based storage:', classroomId);
              loaded = true;
            }
          }
        } catch (fetchErr) {
          log.warn('File-based storage fetch failed:', fetchErr);
        }

        // Tier 3: MySQL/Prisma (direct DB lookup via /api/db/stage + /api/db/scene)
        if (!loaded) {
          try {
            const stageRes = await fetch(`/api/db/stage?stageId=${encodeURIComponent(classroomId)}`);
            const scenesRes = await fetch(`/api/db/scene?stageId=${encodeURIComponent(classroomId)}`);
            if (stageRes.ok && scenesRes.ok) {
              const stageJson = await stageRes.json();
              const scenesJson = await scenesRes.json();
              const stageData = stageJson.data || stageJson;
              const scenesData = scenesJson.data || scenesJson;
              if (stageData && Array.isArray(scenesData) && scenesData.length > 0) {
                useStageStore.getState().setStage(stageData);
                useStageStore.setState({
                  scenes: scenesData.sort((a: { order: number }, b: { order: number }) => a.order - b.order),
                  currentSceneId: scenesData[0]?.id ?? null,
                });
                log.info('Loaded from MySQL/Prisma:', classroomId);
              }
            }
          } catch (dbErr) {
            log.warn('MySQL/Prisma fetch failed:', dbErr);
          }
        }
      }

      // Step 2: Auto-enroll: create UserCourse record if not already enrolled
      try {
        await fetch('/api/db/user-course', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'enroll',
            data: { stageId: classroomId, source: 'self_selected' },
          }),
        });
      } catch (enrollErr) {
        log.warn('[Classroom] Auto-enroll failed:', enrollErr);
      }

      // Always merge server-side scenes that may not be in IndexedDB/file storage,
      // and update existing scenes
      // with server versions (admin may have edited speech scripts, etc.)
      if (useStageStore.getState().stage) {
        try {
          const sceneRes = await fetch(`/api/db/scene?stageId=${encodeURIComponent(classroomId)}`);
          if (sceneRes.ok) {
            const sceneJson = await sceneRes.json();
            const serverScenes = sceneJson.data || sceneJson;
            if (Array.isArray(serverScenes) && serverScenes.length > 0) {
              const currentScenes = useStageStore.getState().scenes;
              const serverMap = new Map(serverScenes.map((s: { id: string }) => [s.id, s]));
              // Update existing scenes with server versions, keep local-only scenes
              const updated = currentScenes.map((local: { id: string }) =>
                serverMap.has(local.id) ? serverMap.get(local.id)! : local
              );
              // Add server-only scenes not present locally
              const localIds = new Set(currentScenes.map((s: { id: string }) => s.id));
              const newScenes = serverScenes.filter((s: { id: string }) => !localIds.has(s.id));
              if (newScenes.length > 0) {
                log.info(`Merging ${newScenes.length} new server-side scenes`);
              }
              const merged = [...updated, ...newScenes].sort(
                (a: { order: number }, b: { order: number }) => a.order - b.order,
              );
              useStageStore.setState({ scenes: merged });
            }
          }
        } catch (mergeErr) {
          log.warn('Scene merge from server failed:', mergeErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }

      // ── Auto-select mode based on the persisted learning mode ──
      // Priority 1: sessionStorage (set by homepage/generation-preview, most reliable)
      let supportedModesArr: string[] | undefined;
      let persistedLearningMode: 'teaching' | 'oneOnOne' | undefined;
      try {
        const stored = sessionStorage.getItem('classroomSupportedModes');
        if (stored) {
          supportedModesArr = JSON.parse(stored) as string[];
          sessionStorage.removeItem('classroomSupportedModes'); // One-time use
        }
      } catch { /* ignore */ }

      // Always fetch directorConfig from DB to restore pdfText (needed by one-on-one mode)
      try {
        const stageRes = await fetch(`/api/db/stage?stageId=${encodeURIComponent(classroomId)}`);
        if (stageRes.ok) {
          const stageJson = await stageRes.json();
          const stageData = stageJson.data || stageJson;
          const dirConfig = stageData?.directorConfig as Record<string, unknown> | null;
          persistedLearningMode = deriveLearningMode(stageData);

          // Restore pdfText so one-on-one mode can use it (even after page refresh)
          if (dirConfig?.pdfText && typeof dirConfig.pdfText === 'string') {
            useStageStore.getState().setPdfText(dirConfig.pdfText as string);
            log.info(`[Classroom] Restored pdfText from directorConfig (${(dirConfig.pdfText as string).length} chars)`);
          }

          // Sync stage name from DB (may have been renamed in admin panel)
          if (stageData?.name && typeof stageData.name === 'string') {
            const currentStage = useStageStore.getState().stage;
            if (currentStage && currentStage.name !== stageData.name) {
              useStageStore.getState().setStage({ ...currentStage, name: stageData.name });
              log.info(`[Classroom] Synced stage name from DB: "${stageData.name}"`);
            }
          }

          // Fill supportedModes from DB if sessionStorage didn't have it
          if (!supportedModesArr) {
            supportedModesArr = persistedLearningMode
              ? [persistedLearningMode]
              : dirConfig?.supportedModes as string[] | undefined;
          }
        }
      } catch (modeErr) {
        log.warn('[Classroom] Failed to load directorConfig from DB:', modeErr);
      }

      // Auto-select mode based on supportedModes config
      if (!supportedModesArr || supportedModesArr.length === 0) {
        // No mode config → default to teaching mode, skip selector
        setMode('teaching');
        log.info('[Classroom] No supportedModes config, defaulting to teaching mode');
      } else if (supportedModesArr.length === 1) {
        const singleMode = supportedModesArr[0];
        if (singleMode === 'teaching' || singleMode === 'oneOnOne') {
          setMode(singleMode);
          log.info(`[Classroom] Auto-selected mode: ${singleMode}`);
        }
      } else {
        // Multiple modes → show selector with filtered options
        setSupportedModes(supportedModesArr.filter(
          (m): m is 'teaching' | 'oneOnOne' => m === 'teaching' || m === 'oneOnOne'
        ));
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  // Get course name for mode selector
  const courseName = useStageStore((s) => s.stage?.name || '课程');

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error === 'NO_PERMISSION' ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center space-y-4">
                <div className="text-6xl">🔒</div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">无权限访问此课程</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">该课程仅对指定用户或角色可见，请联系管理员获取权限。</p>
                <a
                  href="/"
                  className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  返回首页
                </a>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : mode === 'selecting' ? (
            <ModeSelector
              courseName={courseName}
              onSelectMode={(m) => setMode(m)}
              supportedModes={supportedModes}
            />
          ) : mode === 'oneOnOne' ? (
            <OneOnOneStage onSwitchMode={() => setMode('selecting')} />
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
