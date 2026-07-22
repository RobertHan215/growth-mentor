'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Swords,
  Send,
  Mic,
  MicOff,
  Loader2,
  Square,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  BookOpen,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ClipboardList,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/store/settings';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useRouter } from 'next/navigation';
import { useAudioRecorder } from '@/lib/hooks/use-audio-recorder';
import { ReferencePanel, type ReferenceData } from './reference-panel';
import type { WeaknessDisplayItem } from '@/lib/types/training-weakness';
import { CharacterSelectionOverlay } from './character-selection-overlay';
import type { TrainingStartConfig } from '@/components/chat/training-config-modal';
import type { TrainingRoleConfig } from '@/components/chat/training-config-modal';
import { HistoryDrawer } from './history-drawer';
import { createLogger } from '@/lib/logger';
import { useOneOnOneTTS } from '@/lib/hooks/use-one-on-one-tts';
import { AvatarDisplay } from '@/components/ui/avatar-display';
import {
  DEFAULT_ONE_ON_ONE_CONFIG,
  getPersonalityPrompt,
  isVisibleOneOnOnePromptDimension,
} from '@/lib/training/one-on-one-config';
import { DEFAULT_TEACHER_AVATAR, DEFAULT_USER_AVATAR } from '@/components/roundtable/constants';
import {
  TrainingReportCard,
  type TrainingReportData,
} from '@/components/training/training-report-card';
import { stripTrainingControlTags } from '@/lib/training/control-tags';
import { NegotiationTableWhiteboard } from './negotiation-table-whiteboard';
import { buildNegotiationTableBoardState } from '@/lib/training/negotiation-table-whiteboard';
import { TimelineWhiteboard } from './timeline-whiteboard';
import {
  buildClassDirectorOpening,
  buildOneOnOneOpeningSequence,
  buildSensitiveWordBanner,
  buildSensitiveWordWhiteboardContent,
  type SensitiveWordNotice,
  type SensitiveWordSource,
} from '@/lib/training/one-on-one-session-presentation';
import { detectClosingPromptCompletion } from '@/lib/training/turn-analysis';

const log = createLogger('OneOnOne');

type OneOnOneWhiteboardRenderer = 'timeline' | 'negotiation-table';

// Code-level switch for comparing the legacy timeline and the new negotiation table.
// Set to 'timeline' to restore the previous whiteboard renderer.
const ONE_ON_ONE_WHITEBOARD_RENDERER: OneOnOneWhiteboardRenderer = 'timeline';

interface OneOnOneStageProps {
  readonly onSwitchMode: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Intercepted messages are visible placeholders, but excluded from context/evaluation. */
  intercepted?: boolean;
  /** If set, this message is a training report card */
  trainingReport?: TrainingReportData;
  audioUrl?: string;
}

interface NamedKnowledgePoint {
  name: string;
}

function hasKnowledgePointName(value: unknown): value is NamedKnowledgePoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

function nowMs(): number {
  return Date.now();
}

function normalizeSensitiveWords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

const COURSE_REFERENCE_KEYWORDS = [
  '目标',
  '规则',
  '要求',
  '流程',
  '话术',
  '异议',
  '承诺',
  '还款',
  '金额',
  '日期',
  '逾期',
  '利率',
  '分期',
  '催收',
  '客户',
  '合规',
];

function buildCourseReference(courseContent: string, fallback: string): string {
  const normalized = courseContent
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean);

  const openingLines = normalized.slice(0, 4);
  const keywordLines = normalized
    .filter((line) => COURSE_REFERENCE_KEYWORDS.some((keyword) => line.includes(keyword)))
    .slice(0, 12);

  const seen = new Set<string>();
  const selected = [...openingLines, ...keywordLines].filter((line) => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  return (selected.join('\n') || fallback).slice(0, 2000);
}

/** A single entry on the persistent whiteboard */
interface WhiteboardEntry {
  id: string;
  /** info=基本情况 data=数据/金额 commitment=承诺 formula=公式/规则 note=备注 */
  type: 'info' | 'data' | 'commitment' | 'formula' | 'note';
  content: string;
  timestamp: number;
  round: number;
}

interface TurnAnalysisResponse {
  analysis?: {
    sessionComplete?: {
      complete?: boolean;
      reason?: string;
    };
    boardEntries?: Array<{
      type?: WhiteboardEntry['type'];
      content?: string;
    }>;
    roleConfusion?: {
      detected?: boolean;
      reason?: string;
    };
  };
}

export function OneOnOneStage({ onSwitchMode: _onSwitchMode }: OneOnOneStageProps) {
  const router = useRouter();
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);

  // ── State ──
  const [phase, setPhase] = useState<
    'configuring' | 'loading' | 'ready' | 'chatting' | 'evaluating'
  >('loading');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'reference'>('reference');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.62);
  const splitDraggingRef = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [textInputOpen, setTextInputOpen] = useState(false);
  const inputValueRef = useRef(''); // always current, avoids stale closures
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [trainingConfig, setTrainingConfig] = useState<TrainingStartConfig | null>(null);
  const [roleConfig, setRoleConfig] = useState<TrainingRoleConfig | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [reevaluating, setReevaluating] = useState(false);
  const [reeevaluateError, setReevaluateError] = useState<string | null>(null);
  const lastReportMsgId = useMemo(() => {
    const reports = messages.filter((m) => m.trainingReport);
    return reports.length > 0 ? reports[reports.length - 1].id : null;
  }, [messages]);

  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const speakingMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    speakingMsgIdRef.current = speakingMsgId;
  }, [speakingMsgId]);
  // ── Round counting & end suggestion ──
  const [userRoundCount, setUserRoundCount] = useState(0);
  const [showEndSuggestion, setShowEndSuggestion] = useState(false);
  const [endSuggestionReason, setEndSuggestionReason] = useState('');
  const [endSuggestionSource, setEndSuggestionSource] = useState<'ai' | 'manual'>('ai');
  const [sessionDone, setSessionDone] = useState(false);
  const [whiteboard, setWhiteboard] = useState<WhiteboardEntry[]>([]);
  // Banner shown when a sensitive word is detected (user or AI)
  const [sensitiveWordBanner, setSensitiveWordBanner] = useState<string | null>(null);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [reportErrorBanner, setReportErrorBanner] = useState<string | null>(null);
  const [canRetryEvaluation, setCanRetryEvaluation] = useState(false);
  const [hitSensitiveWords, setHitSensitiveWords] = useState<SensitiveWordNotice[]>([]);
  const [weaknesses, setWeaknesses] = useState<WeaknessDisplayItem[]>([]);
  const [weaknessesLoading, setWeaknessesLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const currentTurnScrollRef = useRef<HTMLDivElement>(null);
  const systemPromptRef = useRef<string>('');
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [limitSeconds, setLimitSeconds] = useState(15 * 60);
  const limitSecondsRef = useRef(15 * 60);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [hasClosedWarning, setHasClosedWarning] = useState(false);
  const handleEndTrainingRef = useRef<() => void>(() => {});
  const aiContentRef = useRef('');

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Audio: fill input, show 2-second countdown ring, then auto-send ──
  const [voicePending, setVoicePending] = useState(false);
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVoiceTextRef = useRef('');
  const [preferredInputMode, setPreferredInputMode] = useState<'voice' | 'text'>('voice');
  const preferredInputModeRef = useRef(preferredInputMode);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const sessionDoneRef = useRef(false);
  const phaseRef = useRef(phase);
  const asrEnabled = useSettingsStore((s) => s.asrEnabled);
  const asrEnabledRef = useRef(asrEnabled);

  const cancelVoiceCountdown = () => {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    setVoicePending(false);
    pendingVoiceTextRef.current = '';
  };

  // ── Draggable split handler ──
  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDraggingRef.current = true;
    const container = splitContainerRef.current;
    if (!container) return;
    const onMouseMove = (ev: MouseEvent) => {
      if (!splitDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientY - rect.top) / rect.height;
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)));
    };
    const onMouseUp = () => {
      splitDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const pendingAudioUrlRef = useRef<string | null>(null);
  const { isRecording, isProcessing, startRecording, stopRecording } = useAudioRecorder({
    autoStopOnSilence: true,
    onTranscription: (text, audioUrl) => {
      if (!text.trim()) return;
      setVoiceErrorBanner(null);
      // Fill input box so user sees the transcription
      inputValueRef.current = text;
      setInputValue(text);
      setTextInputOpen(true);
      pendingVoiceTextRef.current = text;
      pendingAudioUrlRef.current = audioUrl || null;
      // Cancel any previous pending send
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      setVoicePending(true);
      // Auto-send after 2 seconds
      voiceTimerRef.current = setTimeout(() => {
        voiceTimerRef.current = null;
        setVoicePending(false);
        // Directly use the captured text via ref to avoid stale closure
        const captured = pendingVoiceTextRef.current;
        pendingVoiceTextRef.current = '';
        const capturedAudioUrl = pendingAudioUrlRef.current;
        pendingAudioUrlRef.current = null;
        if (captured.trim()) {
          inputValueRef.current = captured;
          setInputValue(captured);
          handleSendRef.current(capturedAudioUrl || undefined);
        }
      }, 2000);
    },
    onError: (error) => {
      setVoicePending(false);
      pendingVoiceTextRef.current = '';
      if (voiceTimerRef.current) {
        clearTimeout(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      if (error.includes('权限') || error.includes('Permission')) {
        setPreferredInputMode('text');
        setTextInputOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      setVoiceErrorBanner(error);
    },
  });

  useEffect(() => {
    preferredInputModeRef.current = preferredInputMode;
    isRecordingRef.current = isRecording;
    isProcessingRef.current = isProcessing;
    sessionDoneRef.current = sessionDone;
    phaseRef.current = phase;
    asrEnabledRef.current = asrEnabled;
  }, [asrEnabled, isProcessing, isRecording, phase, preferredInputMode, sessionDone]);

  const openTextInput = useCallback(() => {
    if (sessionDoneRef.current) return;
    if (phaseRef.current !== 'chatting') return;
    setTextInputOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const triggerDefaultInput = useCallback(() => {
    if (phaseRef.current !== 'chatting') return;
    if (sessionDoneRef.current) return;
    if (isRecordingRef.current || isProcessingRef.current) return;
    if (voiceTimerRef.current) return;
    if (preferredInputModeRef.current === 'voice' && asrEnabledRef.current) {
      setTextInputOpen(false);
      startRecording();
      return;
    }
    openTextInput();
  }, [openTextInput, startRecording]);

  // ── TTS for AI messages (reads global TTS settings: provider, voice, speed) ──
  const {
    speak: ttsSpeak,
    cancel: ttsCancel,
    isSpeaking: ttsSpeaking,
  } = useOneOnOneTTS({
    onEnd: () => {
      setSpeakingMsgId(null);
      triggerDefaultInput();
    },
    onError: () => {
      setSpeakingMsgId(null);
      triggerDefaultInput();
    },
    onGenerated: (url) => {
      if (speakingMsgIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === speakingMsgIdRef.current ? { ...m, audioUrl: url } : m
          )
        );
      }
    },
  });

  const handlePlayAudio = useCallback((url: string, msgId?: string) => {
    ttsCancel();
    if (playingAudioUrl === url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioUrl(null);
      if (msgId) setSpeakingMsgId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (msgId) setSpeakingMsgId(msgId);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingAudioUrl(url);
      audio.play().catch((err) => {
        console.error('Failed to play audio:', err);
        setPlayingAudioUrl(null);
        if (msgId) setSpeakingMsgId(null);
      });
      audio.onended = () => {
        setPlayingAudioUrl(null);
        audioRef.current = null;
        if (msgId) setSpeakingMsgId(null);
      };
    }
  }, [playingAudioUrl, ttsCancel, setSpeakingMsgId]);

  const handleSpeak = useCallback(
    (msgId: string, text: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (msg?.audioUrl) {
        handlePlayAudio(msg.audioUrl, msgId);
      } else {
        if (speakingMsgId === msgId) {
          ttsCancel();
          setSpeakingMsgId(null);
        } else {
          ttsCancel();
          setSpeakingMsgId(msgId);
          ttsSpeak(text, trainingConfig?.selectedTemplateId || undefined);
        }
      }
    },
    [speakingMsgId, messages, ttsCancel, ttsSpeak, trainingConfig?.selectedTemplateId, handlePlayAudio, setSpeakingMsgId],
  );

  const handleVoiceToggle = useCallback(() => {
    if (!asrEnabled || sessionDone || isProcessing) return;
    setPreferredInputMode('voice');
    if (voicePending) cancelVoiceCountdown();
    setTextInputOpen(false);
    if (ttsSpeaking) {
      ttsCancel();
      setSpeakingMsgId(null);
    }
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  }, [
    asrEnabled,
    isProcessing,
    isRecording,
    sessionDone,
    startRecording,
    stopRecording,
    ttsCancel,
    ttsSpeaking,
    voicePending,
  ]);

  const handleTextInputToggle = useCallback(() => {
    if (sessionDone) return;
    setPreferredInputMode('text');
    if (voicePending) cancelVoiceCountdown();
    if (isRecording) stopRecording();
    if (ttsSpeaking) {
      ttsCancel();
      setSpeakingMsgId(null);
    }
    setTextInputOpen((open) => {
      const next = !open;
      if (next) window.setTimeout(() => inputRef.current?.focus(), 0);
      return next;
    });
  }, [isRecording, sessionDone, stopRecording, ttsCancel, ttsSpeaking, voicePending]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      ttsCancel();
    };
  }, [ttsCancel]);

  // ── Derive full course content for AI context (priority: pdfText > speech text > stage name) ──
  const pdfTextFromStore = useStageStore((s) => s.pdfText);

  const getFullCourseContent = useCallback(() => {
    // 1. Best case: original PDF text (most informative)
    if (pdfTextFromStore && pdfTextFromStore.trim().length > 0) {
      return pdfTextFromStore.slice(0, 12000); // cap to ~4000 tokens to stay within budget
    }

    // 2. Fallback: extract speech text from generated scenes
    const speechText = scenes
      .map((scene) => {
        const texts: string[] = [];
        if (scene.title) texts.push(`## ${scene.title}`);
        if (scene.actions) {
          scene.actions.forEach((action) => {
            if (action.type === 'speech' && 'text' in action) {
              texts.push((action as { text: string }).text);
            }
          });
        }
        return texts.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');

    return speechText;
  }, [scenes, pdfTextFromStore]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Initial setup: load reference + roles in parallel, then show modal ──
  const [setupProgress, setSetupProgress] = useState<string>('正在分析课程内容...');
  const setupStartedRef = useRef(false);

  useEffect(() => {
    if (setupStartedRef.current) return;
    setupStartedRef.current = true;

    const loadSetup = async () => {
      if (!stage) return;

      // When no scenes exist (oneOnOne-only mode), use stage.name as content
      // IMPORTANT: read pdfText from store.getState() at call time, not from React closure,
      // because the React state snapshot captured at mount time may not yet contain pdfText
      // (classroom page sets it asynchronously via DB fetch).
      const freshPdfText = useStageStore.getState().pdfText;
      let courseContent =
        freshPdfText && freshPdfText.trim().length > 0
          ? freshPdfText.slice(0, 12000)
          : getFullCourseContent();
      if (!courseContent) {
        courseContent = stage.name || '一对一对练';
        log.info('[OneOnOne] No scenes found, using stage name as course content');
      }

      const stageId = stage.id;

      // Load BOTH in parallel
      setSetupProgress('正在提取知识点和参考话术...');

      const mc = getCurrentModelConfig();
      const modelHeaders: Record<string, string> = {
        'x-model': mc.modelString || '',
        'x-api-key': mc.apiKey || '',
        'x-use-frontend-model-config': String(mc.useFrontendModelConfig ?? false),
      };
      if (mc.baseUrl) modelHeaders['x-base-url'] = mc.baseUrl;
      if (mc.providerType) modelHeaders['x-provider-type'] = mc.providerType;
      if (mc.requiresApiKey) modelHeaders['x-requires-api-key'] = 'true';

      const [roleResult, refResult] = await Promise.allSettled([
        // 1. Load role config
        (async () => {
          const res = await fetch('/api/training/generate-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...modelHeaders },
            body: JSON.stringify({
              sceneContent: courseContent,
              sceneTitle: stage.name || '',
              courseName: stage.name || '',
              stageId,
            }),
          });
          if (res.ok) return res.json();
          throw new Error('Failed');
        })(),
        // 2. Load reference data
        (async () => {
          const res = await fetch('/api/training/reference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...modelHeaders },
            body: JSON.stringify({ courseContent, courseName: stage.name, stageId }),
          });
          if (res.ok) return res.json();
          throw new Error('Failed');
        })(),
      ]);

      // Process role config
      if (roleResult.status === 'fulfilled') {
        const data = roleResult.value;
        setRoleConfig({
          background: data.background || '',
          userRole: data.userRole || { name: '学员', description: '' },
          aiRole: data.aiRole || { name: 'AI助教', description: '' },
          whoSpeaksFirst: data.whoSpeaksFirst || 'ai',
          aiFirstMessage: data.aiFirstMessage || '',
          globalConfig: data.globalConfig || DEFAULT_ONE_ON_ONE_CONFIG,
          selectedTemplateId: data.selectedTemplateId,
          templateOptions: Array.isArray(data.templateOptions) ? data.templateOptions : undefined,
          scoringDimensions: Array.isArray(data.scoringDimensions)
            ? data.scoringDimensions
            : undefined,
          knowledgePoints: Array.isArray(data.knowledgePoints) ? data.knowledgePoints : undefined,
        });
      } else {
        setRoleConfig({
          background: `基于「${stage.name}」的对练场景`,
          userRole: { name: '学员', description: '正在学习的学员' },
          aiRole: { name: 'AI助教', description: '帮助学员练习的AI助教' },
          whoSpeaksFirst: 'ai',
          aiFirstMessage: `你好！我们来一起练习「${stage.name}」的内容吧！`,
          globalConfig: DEFAULT_ONE_ON_ONE_CONFIG,
        });
      }

      // Process reference data
      if (refResult.status === 'fulfilled') {
        setReferenceData(refResult.value);
      }
      setReferenceLoading(false);

      // Both done — show config modal
      setPhase('configuring');
      setShowConfigModal(true);
    };

    loadSetup();
  }, [getFullCourseContent, stage]);

  // ── Load historical weaknesses ──
  useEffect(() => {
    if (!stage?.id) return;
    let cancelled = false;
    (async () => {
      setWeaknessesLoading(true);
      try {
        const res = await fetch(`/api/training/weaknesses?stageId=${encodeURIComponent(stage.id)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setWeaknesses(data.weaknesses || []);
        }
      } catch (err) {
        log.warn('[OneOnOne] 加载历史不足失败:', err);
      } finally {
        if (!cancelled) setWeaknessesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stage?.id]);

  // ── Start training ──
  const handleTrainingStart = useCallback(
    (config: TrainingStartConfig) => {
      setShowConfigModal(false);
      setTrainingConfig(config);
      startTimeRef.current = nowMs();

      const fullCourseContent = getFullCourseContent() || stage?.name || '一对一对练';
      const courseReference = buildCourseReference(fullCourseContent, stage?.name || '一对一对练');
      const globalConfig = config.globalConfig || DEFAULT_ONE_ON_ONE_CONFIG;
      // Use personalityType from character template if available, otherwise use the selected personality
      const effectivePersonality = config.aiRole?.persona?.personalityType || config.personality;
      const personalityInstruction = getPersonalityPrompt(globalConfig, effectivePersonality);

      systemPromptRef.current = `你正在参与一对一对练模式。

## 角色锁定
- 你只扮演「${config.aiRole.name}」；用户扮演「${config.userRole.name}」。
- 用户发来的每条消息都视为「${config.userRole.name}」说的话。
- 回复里的“我”只能指「${config.aiRole.name}」，不要替「${config.userRole.name}」发言，不要切换或互换角色。

## 场景
${config.background}

## 课程关键参考
${courseReference}

## 你的角色
角色名：${config.aiRole.name}
${config.aiRole.description}
${(() => {
  const p = config.aiRole.persona;
  if (!p) return '';
  const lines: string[] = ['\n角色档案（按此扮演）：'];
  if (p.age !== undefined) lines.push(`- 年龄：${p.age}岁${p.gender ? '，' + p.gender : ''}`);
  if (p.occupation) lines.push(`- 职业：${p.occupation}`);
  if (p.monthlyIncome !== undefined)
    lines.push(`- 月收入：约 ${(p.monthlyIncome as number).toLocaleString()} 元`);
  if (
    p.monthlyPayment !== undefined ||
    p.totalInstallments !== undefined ||
    p.paidInstallments !== undefined
  ) {
    lines.push(
      `- 客户情况：${[
        p.monthlyPayment !== undefined
          ? `月供约 ${(p.monthlyPayment as number).toLocaleString()} 元`
          : '',
        p.totalInstallments !== undefined ? `共 ${p.totalInstallments} 期` : '',
        p.paidInstallments !== undefined ? `已还 ${p.paidInstallments} 期` : '',
      ]
        .filter(Boolean)
        .join('，')}`,
    );
  }
  if (p.debtAmount !== undefined)
    lines.push(
      `- 逾期金额：${(p.debtAmount as number).toLocaleString()} 元${p.debtDays ? '，已逾期 ' + p.debtDays + ' 天' : ''}`,
    );
  if (p.debtReason) lines.push(`- 借款原因：${p.debtReason}`);
  if (p.familyStatus) lines.push(`- 家庭情况：${p.familyStatus}`);
  if (p.personalityType) lines.push(`- 性格类型：${p.personalityType}`);
  if (p.behaviorTraits) lines.push(`- 惯用话术：${p.behaviorTraits}`);
  if (p.customerSituation) lines.push(`- 客户情况：${p.customerSituation}`);
  if (p.catchphrases) {
    lines.push(`- 还款口头禅：${p.catchphrases}`);
    lines.push('- 使用要求：当用户追问还款、承诺、资金安排或逾期处理时，自然穿插上述口头禅，但不要每轮机械重复。');
  }
  if (p.closingPrompt) {
    lines.push(`- 结束提示词：${p.closingPrompt}`);
  }
  if (Array.isArray(p.promptDimensions) && p.promptDimensions.length > 0) {
    lines.push('\n后台维度：');
    p.promptDimensions.forEach((dimension) => {
      if (dimension.label && dimension.content) {
        lines.push(`- ${dimension.label}：${dimension.content}`);
      }
    });
  }
  return lines.join('\n');
})()}

## 对方角色
${config.userRole.name}：${config.userRole.description}

## 对练规则
- 直接以「${config.aiRole.name}」口吻回应，不标注角色名
- 每次 2-4 句话，口语化
- 结合场景、角色档案和用户回应推进对话
- 沟通风格：${personalityInstruction}
- 如果角色档案包含结束提示词，只在双方沟通进入收尾、用户要求明确处理时间、或需要形成承诺时自然使用；不要在开场或无铺垫时主动抛出
- 不输出 markdown、控制标签、JSON、评分、白板记录或系统分析${weaknesses.length > 0 ? `

## 学员弱项提醒
自然创造机会观察这些弱项，不要直接告诉学员：
${weaknesses.slice(0, 3).map((w) => `- ${w.name}：${w.description}。引导点：${w.suggestion}`).join('\n')}

学员表现良好时正常推进。` : ''}`;

      log.info('[OneOnOne] system prompt generated', {
        length: systemPromptRef.current.length,
        aiRole: config.aiRole.name,
        userRole: config.userRole.name,
        selectedTemplateId: config.selectedTemplateId || null,
        hasRealSpeechTemplate: Boolean(config.selectedTemplateId),
      });
      log.info(`\n========== OneOnOne Generated System Prompt ==========\n${systemPromptRef.current}\n========== End OneOnOne Generated System Prompt ==========`);

      setPhase('ready');
    },
    [getFullCourseContent, stage, weaknesses],
  );

  // ── Actually start the dialogue (from ready phase) ──
  const handleStartDialogue = useCallback(() => {
    if (!trainingConfig) return;
    startTimeRef.current = nowMs();
    setElapsedSeconds(0);
    setLimitSeconds(15 * 60);
    limitSecondsRef.current = 15 * 60;
    setShowTimeoutModal(false);
    setShowTimeWarning(false);
    setHasClosedWarning(false);

    const persona = trainingConfig.aiRole.persona;
    if (persona) {
      // Seed learner-facing whiteboard with only visible business context.
      const personaEntries: WhiteboardEntry[] = [];
      const visibleDimensions = Array.isArray(persona.promptDimensions)
        ? persona.promptDimensions.filter(
            (dimension) =>
              isVisibleOneOnOnePromptDimension(dimension) &&
              Boolean(dimension.label && dimension.content),
          )
        : [];
      const hasCustomerSituation = visibleDimensions.some(
        (dimension) => dimension.label.trim() === '客户情况',
      );

      if (!hasCustomerSituation && persona.customerSituation) {
        personaEntries.push({
          id: `wb-${Date.now()}-customer-situation-profile`,
          type: 'data',
          content: `客户情况：${persona.customerSituation}`,
          timestamp: Date.now(),
          round: 0,
        });
      } else if (!hasCustomerSituation) {
        const customerSituation = [
          persona.monthlyPayment !== undefined
            ? `月供 ${(persona.monthlyPayment as number).toLocaleString()} 元`
            : '',
          persona.totalInstallments !== undefined ? `共 ${persona.totalInstallments} 期` : '',
          persona.paidInstallments !== undefined ? `已还 ${persona.paidInstallments} 期` : '',
          persona.debtDays !== undefined ? `已逾期 ${persona.debtDays} 天` : '',
        ]
          .filter(Boolean)
          .join('，');

        if (customerSituation) {
          personaEntries.push({
            id: `wb-${Date.now()}-customer-situation`,
            type: 'data',
            content: `客户情况：${customerSituation}`,
            timestamp: Date.now(),
            round: 0,
          });
        }
      }

      visibleDimensions.forEach((dimension, index) => {
        personaEntries.push({
          id: `wb-${Date.now()}-visible-dim-${index}`,
          type: dimension.label.trim() === '客户情况' ? 'data' : 'info',
          content: `${dimension.label}：${dimension.content}`,
          timestamp: Date.now(),
          round: 0,
        });
      });
      if (personaEntries.length > 0) setWhiteboard(personaEntries);
    }

    const opening = buildClassDirectorOpening({
      name: trainingConfig.aiRole.name,
      debtAmount: persona?.debtAmount,
      debtDays: persona?.debtDays,
      monthlyPayment: persona?.monthlyPayment,
      totalInstallments: persona?.totalInstallments,
      paidInstallments: persona?.paidInstallments,
    });
    const startedAt = Date.now();
    const openingSequence = buildOneOnOneOpeningSequence({
      opening,
      startedAt,
      whoSpeaksFirst: trainingConfig.whoSpeaksFirst,
      aiFirstMessage: trainingConfig.aiFirstMessage,
    });

    setMessages(openingSequence.messages);
    setPhase('chatting');
    setTextInputOpen(false);

    setSpeakingMsgId(openingSequence.spokenMessageId);
    ttsSpeak(openingSequence.spokenText, trainingConfig.selectedTemplateId || undefined);
  }, [trainingConfig, ttsSpeak]);

  // ── Send message (uses /api/training/chat SSE stream) ──
  const handleSendRef = useRef<(audioUrlOrEvent?: string | React.MouseEvent) => void>((_audioUrlOrEvent) => {});

  const handleSend = useCallback(async (audioUrlOrEvent?: string | React.MouseEvent) => {
    const audioUrl = typeof audioUrlOrEvent === 'string' ? audioUrlOrEvent : undefined;
    const text = (inputValueRef.current || inputValue).trim();
    if (!text || isAiThinking) return;

    // Add user message
    const createdAt = nowMs();
    const userMsg: ChatMessage = {
      id: `msg-${createdAt}`,
      role: 'user',
      content: text,
      timestamp: createdAt,
      audioUrl,
    };
    setMessages((prev) => [...prev, userMsg]);
    inputValueRef.current = '';
    setInputValue('');
    setTextInputOpen(false);
    setIsAiThinking(true);

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const allMessages = [...messages, userMsg]
        .filter(
          (m) =>
            !m.trainingReport && !m.intercepted && (m.role === 'user' || m.role === 'assistant'),
        )
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const mc = getCurrentModelConfig();
      const res = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          systemPrompt: systemPromptRef.current,
          aiRoleName: trainingConfig?.aiRole?.name || 'AI',
          selectedTemplateId: trainingConfig?.selectedTemplateId,
          mode: 'one-on-one',
          model: mc.modelString,
          apiKey: mc.apiKey,
          baseUrl: mc.baseUrl,
          providerType: mc.providerType,
          useFrontendModelConfig: mc.useFrontendModelConfig,
        }),
        signal: abortController.signal,
      });

      let aiMsgId = '';
      aiContentRef.current = '';
      let sensitiveNotice: SensitiveWordNotice | null = null;
      let sensitiveNoticeRecorded = false;
      const recordSensitiveWordNotice = (
        rawSource: unknown,
        rawMatched: unknown,
        rawCategory?: unknown,
      ): SensitiveWordNotice => {
        const source: SensitiveWordSource = rawSource === 'ai' ? 'ai' : 'user';
        const matched = normalizeSensitiveWords(rawMatched);
        const normalizedCategory =
          typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : undefined;
        sensitiveNotice = { source, matched, category: normalizedCategory };

        if (!sensitiveNoticeRecorded) {
          setHitSensitiveWords((prev) => [...prev, sensitiveNotice!]);
          setSensitiveWordBanner(buildSensitiveWordBanner(sensitiveNotice));
          const timestamp = nowMs();
          setWhiteboard((prev) => [
            ...prev,
            {
              id: `wb-sensitive-${timestamp}-${prev.length}`,
              type: 'note',
              content: buildSensitiveWordWhiteboardContent(sensitiveNotice!),
              timestamp,
              round: userRoundCount + 1,
            },
          ]);
          sensitiveNoticeRecorded = true;
        }

        return sensitiveNotice;
      };

      if (res.ok && res.body) {
        // Parse SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        aiMsgId = `msg-${nowMs()}`;

        // Add empty AI message that we'll update with streaming content
        setMessages((prev) => [
          ...prev,
          {
            id: aiMsgId,
            role: 'assistant' as const,
            content: '',
            timestamp: nowMs(),
          },
        ]);

        let buffer = '';
        let sensitiveHit = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'text_delta' && event.data?.content) {
                aiContentRef.current += event.data.content;
                const aiContent = stripTrainingControlTags(aiContentRef.current);
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMsgId ? { ...m, content: aiContent } : m)),
                );
              } else if (event.type === 'sensitive_word_detected' && event.data) {
                recordSensitiveWordNotice(
                  event.data.source,
                  event.data.matched,
                  event.data.category,
                );
              } else if (event.type === 'error' && event.data?.errorCode === 'SENSITIVE_WORD') {
                sensitiveHit = true;
                const notice =
                  sensitiveNotice ??
                  recordSensitiveWordNotice(
                    event.data.source,
                    event.data.matched ?? event.data.details,
                    event.data.category,
                  );
                ttsCancel();
                if (notice.source === 'user') {
                  setInputValue(text);
                  inputValueRef.current = text;
                  setMessages((prev) =>
                    prev
                      .filter((m) => m.id !== aiMsgId)
                      .map((m) =>
                        m.id === userMsg.id
                          ? {
                              ...m,
                              content: '（用词不当，已拦截，请重新表述）',
                              intercepted: true,
                            }
                          : m,
                      ),
                  );
                } else {
                  setSessionDone(true);
                  // Remove the streaming AI message (it contains the sensitive content).
                  setMessages((prev) => prev.filter((m) => m.id !== aiMsgId));
                }
                setIsAiThinking(false);
                abortControllerRef.current = null;
                return;
              }
            } catch {
              /* skip non-JSON lines */
            }
          }
          if (sensitiveHit) break;
        }
      } else if (!res.ok) {
        // Handle non-streaming error responses
        const errorData = await res.json().catch(() => ({}));
        if (errorData.errorCode === 'SENSITIVE_WORD') {
          recordSensitiveWordNotice(errorData.source, errorData.matched ?? errorData.details);
          ttsCancel();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMsg.id
                ? { ...m, content: '（用词不当，已拦截，请重新表述）', intercepted: true }
                : m,
            ),
          );
          setInputValue(text);
          inputValueRef.current = text;
          setIsAiThinking(false);
          abortControllerRef.current = null;
          return;
        }
      }

      // ── Post-stream cleanup and async turn analysis ──
      const aiContent = aiContentRef.current;
      if (aiContent) {
        const cleanForDisplay = stripTrainingControlTags(aiContent);

        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: cleanForDisplay || aiContent } : m)),
        );

        setSpeakingMsgId(aiMsgId);
        ttsSpeak(cleanForDisplay, trainingConfig?.selectedTemplateId || undefined);

        const closingPrompt = trainingConfig?.aiRole?.persona?.closingPrompt?.trim() || '';
        const closingPromptCheck = closingPrompt
          ? detectClosingPromptCompletion({
              closingPrompt,
              latestAiMessage: cleanForDisplay || aiContent,
            })
          : null;
        if (closingPromptCheck?.complete && !showEndSuggestion) {
          setEndSuggestionSource('ai');
          setEndSuggestionReason(closingPromptCheck.reason || '客户已给出收尾承诺');
          setShowEndSuggestion(true);
        }

        const round = userRoundCount + 1;
        const analysisMessages = [
          ...allMessages,
          {
            role: 'assistant' as const,
            content: cleanForDisplay || aiContent,
          },
        ].slice(-8);

        void (async () => {
          try {
            const mc = getCurrentModelConfig();
            const analysisRes = await fetch('/api/training/analyze-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                aiRoleName: trainingConfig?.aiRole?.name || 'AI',
                userRoleName: trainingConfig?.userRole?.name || '用户',
                latestUserMessage: text,
                latestAiMessage: cleanForDisplay || aiContent,
                recentMessages: analysisMessages,
                round,
                ...(closingPrompt ? { closingPrompt } : {}),
                model: mc.modelString,
                apiKey: mc.apiKey,
                baseUrl: mc.baseUrl,
                providerType: mc.providerType,
                useFrontendModelConfig: mc.useFrontendModelConfig,
              }),
            });

            if (!analysisRes.ok) {
              log.warn('Turn analysis request failed', { status: analysisRes.status });
              return;
            }

            const payload = (await analysisRes.json()) as TurnAnalysisResponse;
            const analysis = payload.analysis;
            if (!analysis) return;

            if (analysis.roleConfusion?.detected) {
              log.warn('[OneOnOne] role confusion detected by turn analyzer', {
                reason: analysis.roleConfusion.reason || '',
                aiRoleName: trainingConfig?.aiRole?.name || 'AI',
                userRoleName: trainingConfig?.userRole?.name || '用户',
                latestAiMessage: cleanForDisplay || aiContent,
              });
            }

            if (analysis.sessionComplete?.complete && !showEndSuggestion) {
              setEndSuggestionSource('ai');
              setEndSuggestionReason(analysis.sessionComplete.reason || '本轮对练已达到结束条件');
              setShowEndSuggestion(true);
            }

            const boardEntries = (analysis.boardEntries || [])
              .map((entry) => ({
                type: entry.type || 'note',
                content: typeof entry.content === 'string' ? entry.content.trim() : '',
              }))
              .filter((entry): entry is Pick<WhiteboardEntry, 'type' | 'content'> =>
                Boolean(entry.content),
              );

            if (boardEntries.length > 0) {
              const timestamp = nowMs();
              setWhiteboard((prev) => [
                ...prev,
                ...boardEntries.map((entry, i) => ({
                  id: `wb-analysis-${timestamp}-${i}`,
                  type: entry.type,
                  content: entry.content,
                  timestamp,
                  round,
                })),
              ]);
            }
          } catch (analysisError) {
            log.warn('Turn analysis failed:', analysisError);
          }
        })();
      }

      // Increment user round count & remind at 20 then every 10 rounds
      const newRoundCount = userRoundCount + 1;
      setUserRoundCount(newRoundCount);
      const isFirstReminder = newRoundCount === 20;
      const isRecurringReminder = newRoundCount > 20 && (newRoundCount - 20) % 10 === 0;
      if (isFirstReminder || isRecurringReminder) {
        setEndSuggestionSource('ai');
        setEndSuggestionReason(`已完成 ${newRoundCount} 轮对话，是否结束本次对练？`);
        setShowEndSuggestion(true);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        log.error('Chat error:', err);
      }
    }

    setIsAiThinking(false);
    abortControllerRef.current = null;
  }, [
    inputValue,
    isAiThinking,
    messages,
    trainingConfig,
    ttsSpeak,
    ttsCancel,
    userRoundCount,
    showEndSuggestion,
  ]);

  // Keep ref in sync for voice auto-send
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Cleanup voice timer on unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    };
  }, []);

  // ── Timer control functions ──
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) return;
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        const remaining = limitSecondsRef.current - next;

        // Show 60s warning when remaining seconds <= 60
        if (remaining <= 60 && remaining > 0) {
          setShowTimeWarning(true);
        } else {
          setShowTimeWarning(false);
        }

        // Timeout reached
        if (remaining <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setShowTimeoutModal(true);
          return s; // Keep showing elapsed time at the limit
        }
        return next;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const handleExtend = useCallback(
    (minutes = 10) => {
      setLimitSeconds((prev) => prev + minutes * 60);
      limitSecondsRef.current += minutes * 60;
      setShowTimeoutModal(false);
      setShowTimeWarning(false);
      setHasClosedWarning(false);
      startTimer();
    },
    [startTimer],
  );

  // ── Elapsed timer: start when chatting begins ──
  useEffect(() => {
    if (phase === 'chatting' && !sessionDone) {
      startTimer();
    } else {
      stopTimer();
    }

    return () => {
      stopTimer();
    };
  }, [phase, sessionDone, startTimer, stopTimer]);

  // ── End training & evaluate ──
  const handleEndTraining = useCallback(async () => {
    if (isEvaluating) return;
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    setVoicePending(false);
    pendingVoiceTextRef.current = '';
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAiThinking(false);
    ttsCancel();
    setSpeakingMsgId(null);
    setShowEndSuggestion(false);
    setReportErrorBanner(null);
    setCanRetryEvaluation(false);
    setIsEvaluating(true);
    setPhase('evaluating');

    const sourceMessages = messagesRef.current;
    const dialogueHistory = sourceMessages
      .filter(
        (m) =>
          !m.trainingReport &&
          !m.intercepted &&
          (m.role === 'user' || m.role === 'assistant') &&
          m.content.trim().length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));
    const hasUserMessage = dialogueHistory.some((m) => m.role === 'user');
    const duration = Math.round((nowMs() - startTimeRef.current) / 1000);
    const config = trainingConfig;
    const difficulty = config?.personality || 'normal';

    if (hasUserMessage) {
      try {
        // ── Scenario detection: use collection-specific dimensions for 催收 scenes ──
        const collectionKeywords = ['催收', '逾期', '还款', '账款', '借款', '债务', '催款', '欠款'];
        const sceneText = [
          stage?.name || '',
          config?.background || '',
          config?.aiRole?.name || '',
          config?.userRole?.name || '',
          config?.aiRole?.description || '',
        ].join(' ');
        const isCollectionScene = collectionKeywords.some((kw) => sceneText.includes(kw));

        const COLLECTION_DIMENSIONS = [
          {
            id: 'opening',
            name: '身份开场与信息确认',
            weight: 0.1,
            description: '是否规范核实借款人身份，清晰确认逾期信息',
          },
          {
            id: 'facts',
            name: '逾期事实陈述与法律依据',
            weight: 0.15,
            description: '是否清楚陈述逾期天数、金额，并引用合同义务或法律依据',
          },
          {
            id: 'empathy',
            name: '情绪应对与共情能力',
            weight: 0.15,
            description: '面对借款人情绪波动时，是否能稳定情绪并有效共情',
          },
          {
            id: 'credit',
            name: '征信与后果教育',
            weight: 0.1,
            description: '是否主动告知逾期对征信、贷款资格的影响',
          },
          {
            id: 'payment_push',
            name: '还款方案推动力',
            weight: 0.2,
            description: '是否锁定具体还款金额与时间节点，形成有约束力的承诺',
          },
          {
            id: 'flexibility',
            name: '话术灵活性与应对"老油条"',
            weight: 0.15,
            description: '对不接电话、随便你、反复拖延等抗性语言的应对策略',
          },
          {
            id: 'compliance',
            name: '合规性与礼貌度',
            weight: 0.1,
            description: '全程是否无威胁、辱骂、虚假承诺等违规行为，语气专业礼貌',
          },
          {
            id: 'followup',
            name: '结尾与跟进机制',
            weight: 0.05,
            description: '是否明确约定下次联系时间或具体行动项，跟进闭环清晰',
          },
        ];

        const GENERIC_DIMENSIONS = (roleConfig as unknown as Record<string, unknown>)
          ?.scoringDimensions
          ? ((roleConfig as unknown as Record<string, unknown>).scoringDimensions as {
              id: string;
              name: string;
              weight: number;
              description: string;
            }[])
          : [
              {
                id: 'communication',
                name: '沟通表达',
                weight: 0.3,
                description: '语言表达是否清晰、得体',
              },
              {
                id: 'professionalism',
                name: '专业知识',
                weight: 0.3,
                description: '是否展现了专业知识',
              },
              {
                id: 'adaptability',
                name: '应变能力',
                weight: 0.2,
                description: '面对不同情况的应变',
              },
              {
                id: 'attitude',
                name: '服务态度',
                weight: 0.2,
                description: '是否态度积极、有耐心',
              },
            ];

        const evaluateStartedAt = nowMs();
        log.info(
          `[一对一评估] 前端提交异步评估任务 消息数=${dialogueHistory.length} 敏感词命中数=${hitSensitiveWords.length}`,
        );
        const evaluationPayload = {
          trainingContent: {
            mode: 'roleplay',
            scenario: {
              background: config?.background || '',
              aiRole: config?.aiRole?.name || 'AI',
              learnerRole: config?.userRole?.name || '学员',
              difficulty,
              difficultyPersonas: {},
            },
            objectives: ['完成角色扮演对练'],
            scoringDimensions: isCollectionScene ? COLLECTION_DIMENSIONS : GENERIC_DIMENSIONS,
            maxRounds: 10,
          },
          dialogueHistory,
          difficulty,
          stageId: stage?.id,
          sensitiveWordsHit: hitSensitiveWords,
          rounds: Math.floor(dialogueHistory.length / 2),
          duration,
          messages: sourceMessages.filter((m) => !m.trainingReport && !m.intercepted),
          roleConfig: trainingConfig,
        };

        const mc = getCurrentModelConfig();
        const jobRes = await fetch('/api/training/evaluate-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-model': mc.modelString || '',
            'x-api-key': mc.apiKey || '',
            ...(mc.baseUrl ? { 'x-base-url': mc.baseUrl } : {}),
            ...(mc.providerType ? { 'x-provider-type': mc.providerType } : {}),
            ...(mc.requiresApiKey ? { 'x-requires-api-key': 'true' } : {}),
            'x-use-frontend-model-config': String(mc.useFrontendModelConfig ?? false),
          },
          body: JSON.stringify(evaluationPayload),
        });

        const jobData = await jobRes.json().catch(() => ({}));
        if (!jobRes.ok || !jobData.jobId) {
          throw new Error(jobData.error || `评估任务提交失败：${jobRes.status}`);
        }

        {
          const initialDelayMs =
            typeof jobData.initialDelayMs === 'number' ? jobData.initialDelayMs : 30_000;
          const pollIntervalMs =
            typeof jobData.pollIntervalMs === 'number' ? jobData.pollIntervalMs : 5_000;
          const maxWaitMs = 300_000;
          const jobId = String(jobData.jobId);
          log.info(
            `[一对一评估] 评估任务已提交 jobId=${jobId} 首次查询延迟=${initialDelayMs}ms 轮询间隔=${pollIntervalMs}ms`,
          );

          await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

          let evaluation: Record<string, unknown> | null = null;
          const deadline = evaluateStartedAt + maxWaitMs;
          while (nowMs() < deadline) {
            const pollStartedAt = nowMs();
            const pollRes = await fetch(`/api/training/evaluate-jobs/${jobId}`, {
              cache: 'no-store',
            });
            const pollData = await pollRes.json().catch(() => ({}));
            log.info(
              `[一对一评估] 查询评估任务 jobId=${jobId} 状态=${pollData.status || pollRes.status} 耗时=${nowMs() - pollStartedAt}ms`,
            );

            if (!pollRes.ok) {
              throw new Error(pollData.error || `查询评估任务失败：${pollRes.status}`);
            }
            if (pollData.status === 'succeeded' && pollData.result) {
              evaluation = pollData.result as Record<string, unknown>;
              break;
            }
            if (pollData.status === 'failed') {
              throw new Error(
                typeof pollData.error === 'string' ? pollData.error : '评估报告生成失败',
              );
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }

          if (!evaluation) {
            throw new Error('评估报告生成超时，请稍后重试或重新生成');
          }

          log.info(
            `[一对一评估] 前端获取评估报告完成 jobId=${jobId} 总耗时=${nowMs() - evaluateStartedAt}ms`,
          );

          const reportData: TrainingReportData = {
            totalScore: typeof evaluation.totalScore === 'number' ? evaluation.totalScore : 0,
            scores: Array.isArray(evaluation.scores)
              ? (evaluation.scores as TrainingReportData['scores'])
              : [],
            scoreTree: evaluation.scoreTree as TrainingReportData['scoreTree'],
            summary: typeof evaluation.summary === 'string' ? evaluation.summary : '',
            highlights: Array.isArray(evaluation.highlights)
              ? (evaluation.highlights as string[])
              : [],
            improvements: Array.isArray(evaluation.improvements)
              ? (evaluation.improvements as string[])
              : [],
            completedObjectives: Array.isArray(evaluation.completedObjectives)
              ? (evaluation.completedObjectives as string[])
              : [],
            difficulty,
            dialogueRounds: Math.floor(dialogueHistory.length / 2),
            duration,
          };

          // Insert report card into chat
          setMessages((prev) => [
            ...prev,
            {
              id: `report-${nowMs()}`,
              role: 'assistant',
              content: '📊 训练评估报告',
              timestamp: nowMs(),
              trainingReport: reportData,
            },
          ]);

          if (evaluation.saved) {
            log.info(
              `[一对一评估] 评估接口已保存报告 结果ID=${evaluation.resultId || '无'} 会话ID=${evaluation.sessionId || '无'}`,
            );
            if (evaluation.sessionId) {
              setCurrentSessionId(evaluation.sessionId as string);
            }
          } else {
            // Compatibility fallback for old evaluate responses or server-side save failures.
            try {
              const saveStartedAt = nowMs();
              const saveRes = await fetch('/api/training/save-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  stageId: stage?.id,
                  totalScore: reportData.totalScore,
                  scores: reportData.scores,
                  scoreTree: reportData.scoreTree,
                  summary: reportData.summary,
                  highlights: reportData.highlights,
                  improvements: reportData.improvements,
                  objectives: reportData.completedObjectives,
                  rounds: reportData.dialogueRounds,
                  duration: reportData.duration,
                  difficulty,
                  messages: sourceMessages.filter((m) => !m.trainingReport && !m.intercepted),
                  roleConfig: trainingConfig,
                }),
              });
              log.info(
                `[一对一评估] 前端兜底保存报告 状态=${saveRes.status} 耗时=${nowMs() - saveStartedAt}ms`,
              );
              if (saveRes.ok) {
                const saveResData = await saveRes.json();
                if (saveResData.sessionId) {
                  setCurrentSessionId(saveResData.sessionId);
                }
              }
            } catch (saveErr) {
              log.error('Failed to save training result:', saveErr);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成评估报告失败';
        log.error('Evaluation failed:', err);
        setReportErrorBanner(`生成评估报告失败：${message}`);
        setCanRetryEvaluation(true);
        setIsEvaluating(false);
        setPhase('chatting');
        return;
      }
    } else {
      setReportErrorBanner('至少发送一条学员消息后，才能生成评估报告。');
      setCanRetryEvaluation(false);
      setIsEvaluating(false);
      setPhase('chatting');
      return;
    }

    setIsEvaluating(false);
    setCanRetryEvaluation(false);
    setSessionDone(true);
    // Stop the timer immediately
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }
    setPhase('chatting');
  }, [trainingConfig, roleConfig, isEvaluating, stage, hitSensitiveWords, ttsCancel]);

  const pollReevaluateJobStatus = useCallback((jobId: string, sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/evaluate-jobs/${jobId}`);
        if (res.ok) {
          const job = await res.json();
          if (job.status === 'completed') {
            clearInterval(interval);
            const historyRes = await fetch(`/api/training/history?stageId=${stage?.id}&limit=5`);
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              const sessionResults = (historyData.results || []).filter((r: { sessionId: string; reportIndex?: number }) => r.sessionId === sessionId);
              if (sessionResults.length > 0) {
                sessionResults.sort((a: { reportIndex?: number }, b: { reportIndex?: number }) => (a.reportIndex || 0) - (b.reportIndex || 0));
                const latestResult = sessionResults[sessionResults.length - 1];
                
                const reportData: TrainingReportData = {
                  totalScore: latestResult.totalScore,
                  scores: Array.isArray(latestResult.scores) ? latestResult.scores : [],
                  scoreTree: latestResult.scoreTree || undefined,
                  summary: latestResult.summary,
                  highlights: latestResult.highlights,
                  improvements: latestResult.improvements,
                  completedObjectives: latestResult.objectives || [],
                  difficulty: latestResult.difficulty,
                  dialogueRounds: latestResult.rounds,
                  duration: latestResult.duration,
                  isRegenerated: latestResult.isRegenerated,
                  reportIndex: latestResult.reportIndex,
                };

                setMessages((prev) => {
                  const targetIndex = [...prev].reverse().findIndex((m) => m.trainingReport);
                  if (targetIndex !== -1) {
                    const realIndex = prev.length - 1 - targetIndex;
                    const newMessages = [...prev];
                    newMessages[realIndex] = {
                      ...newMessages[realIndex],
                      trainingReport: reportData,
                    };
                    return newMessages;
                  }
                  return [
                    ...prev,
                    {
                      id: `report-${nowMs()}`,
                      role: 'assistant',
                      content: '📊 训练评估报告',
                      timestamp: nowMs(),
                      trainingReport: reportData,
                    },
                  ];
                });
              }
            }
            setReevaluating(false);
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setReevaluateError(job.message || '重新评估任务失败');
            setReevaluating(false);
          }
        } else {
          clearInterval(interval);
          setReevaluateError('获取重新评估任务状态失败');
          setReevaluating(false);
        }
      } catch {
        clearInterval(interval);
        setReevaluating(false);
      }
    }, 2000);
  }, [stage?.id]);

  const handleReevaluate = useCallback(async () => {
    if (!currentSessionId || reevaluating) return;
    setReevaluating(true);
    setReevaluateError(null);
    try {
      const res = await fetch(`/api/training/history/${currentSessionId}/reevaluate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to start re-evaluation');
      }
      const data = await res.json();
      pollReevaluateJobStatus(data.jobId, currentSessionId);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : '重新评估失败';
      setReevaluateError(message);
      setReevaluating(false);
    }
  }, [currentSessionId, reevaluating, pollReevaluateJobStatus]);

  useEffect(() => {
    handleEndTrainingRef.current = handleEndTraining;
  }, [handleEndTraining]);

  const requestEndTrainingConfirmation = useCallback(() => {
    if (isEvaluating || sessionDone) return;
    setEndSuggestionSource('manual');
    setEndSuggestionReason('确定要结束本次对练并生成评估报告吗？');
    setShowEndSuggestion(true);
  }, [isEvaluating, sessionDone]);

  // Format elapsed seconds as MM:SS
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  const remainingSeconds = Math.max(0, limitSeconds - elapsedSeconds);
  const visibleKnowledgePoints = Array.isArray(trainingConfig?.knowledgePoints)
    ? trainingConfig.knowledgePoints.filter(hasKnowledgePointName)
    : [];
  const currentTurnUserName = trainingConfig?.userRole?.name || '你';
  const currentTurnAiName = trainingConfig?.aiRole?.name || 'AI';
  const currentTurn = useMemo(() => {
    const dialogueMessages = messages.filter(
      (message) =>
        !message.trainingReport &&
        !message.intercepted &&
        (message.role === 'user' || message.role === 'assistant'),
    );
    const latestUserIndex = dialogueMessages.reduce(
      (latest, message, index) => (message.role === 'user' ? index : latest),
      -1,
    );
    const latestUser = latestUserIndex >= 0 ? dialogueMessages[latestUserIndex] : null;
    const latestAssistantAfterUser =
      latestUserIndex >= 0
        ? dialogueMessages
            .slice(latestUserIndex + 1)
            .reverse()
            .find((message) => message.role === 'assistant')
        : null;
    const latestAssistant =
      latestUserIndex >= 0
        ? latestAssistantAfterUser || null
        : [...dialogueMessages].reverse().find((message) => message.role === 'assistant') || null;

    return {
      aiMessageId: latestAssistant?.id || null,
      userMessageId: latestUser?.id || null,
      userText: latestUser?.content.trim() || null,
      aiText: latestAssistant?.content.trim() || null,
      isAiStreaming: isAiThinking,
    };
  }, [isAiThinking, messages]);
  const currentTurnAiIsSpeaking = Boolean(
    currentTurn.aiMessageId && speakingMsgId === currentTurn.aiMessageId && ttsSpeaking,
  );
  useEffect(() => {
    const el = currentTurnScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [currentTurn.aiText, currentTurn.userText, currentTurn.isAiStreaming]);
  const showCurrentTurnCue = Boolean(
    phase === 'chatting' &&
    !currentTurn.userText &&
    !currentTurn.aiText &&
    !currentTurn.isAiStreaming &&
    !isRecording &&
    !isProcessing &&
    !ttsSpeaking &&
    !textInputOpen &&
    !sessionDone,
  );

  // ── Restart ──
  const handleRestart = useCallback(() => {
    setMessages([]);
    setPhase('configuring');
    setShowConfigModal(true);
    setTrainingConfig(null);
    setUserRoundCount(0);
    setShowEndSuggestion(false);
    setEndSuggestionReason('');
    setEndSuggestionSource('ai');
    setReportErrorBanner(null);
    setSessionDone(false);
    setElapsedSeconds(0);
    setLimitSeconds(15 * 60);
    limitSecondsRef.current = 15 * 60;
    setShowTimeoutModal(false);
    setShowTimeWarning(false);
    setHasClosedWarning(false);
    setWhiteboard([]);
  }, []);

  // ── Regenerate roles ──
  const handleRegenerateRoles = useCallback(async () => {
    if (isRegenerating || !stage) return;
    setIsRegenerating(true);

    try {
      const courseContent = getFullCourseContent() || stage?.name || '一对一对练';
      const res = await fetch('/api/training/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneContent: courseContent,
          sceneTitle: stage.name || '',
          courseName: stage.name || '',
          stageId: stage.id,
          force: true, // bypass cache
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoleConfig({
          background: data.background || '',
          userRole: data.userRole || { name: '学员', description: '' },
          aiRole: data.aiRole || { name: 'AI助教', description: '' },
          whoSpeaksFirst: data.whoSpeaksFirst || 'ai',
          aiFirstMessage: data.aiFirstMessage || '',
          globalConfig: data.globalConfig || DEFAULT_ONE_ON_ONE_CONFIG,
          selectedTemplateId: data.selectedTemplateId,
          templateOptions: Array.isArray(data.templateOptions) ? data.templateOptions : undefined,
          scoringDimensions: Array.isArray(data.scoringDimensions)
            ? data.scoringDimensions
            : undefined,
          knowledgePoints: Array.isArray(data.knowledgePoints) ? data.knowledgePoints : undefined,
        });
      }
    } catch (err) {
      log.error('Failed to regenerate roles:', err);
    }

    setIsRegenerating(false);
  }, [isRegenerating, stage, getFullCourseContent]);

  // ── Key handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const negotiationTableBoardState = useMemo(
    () => buildNegotiationTableBoardState(whiteboard, trainingConfig?.aiRole?.name || '对练对象'),
    [whiteboard, trainingConfig?.aiRole?.name],
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* ── Header ── */}
      <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回
        </button>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Swords className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-gray-800 dark:text-white truncate">
              {stage?.name || '一对一对练'}
            </h1>
            <p className="text-[9px] text-gray-400 dark:text-gray-500">一对一模式</p>
          </div>
        </div>

        {/* Elapsed timer — only visible during chatting */}
        {phase === 'chatting' && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-mono font-semibold tabular-nums',
              sessionDone
                ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                : remainingSeconds <= 120
                  ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400 animate-pulse'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
            )}
          >
            <span>{formatTime(elapsedSeconds)}</span>
            {!sessionDone && (
              <>
                <span className="opacity-40">/</span>
                <span
                  className={
                    remainingSeconds <= 120 ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'
                  }
                >
                  {formatTime(remainingSeconds)}
                </span>
              </>
            )}
            {sessionDone && <span className="text-gray-400 ml-0.5">✓</span>}
          </div>
        )}

        {/* History & End training / Restart */}
        {phase === 'chatting' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <History className="w-3 h-3" />
              训练记录
            </button>
            <button
              onClick={handleRestart}
              className="px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              重新开始
            </button>
            <button
              onClick={requestEndTrainingConfirmation}
              disabled={isEvaluating || sessionDone}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                isEvaluating
                  ? 'bg-gray-100 text-gray-400 cursor-wait dark:bg-gray-800 dark:text-gray-500'
                  : sessionDone
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                    : 'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-sm',
              )}
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  评估中...
                </>
              ) : sessionDone ? (
                <>
                  <Square className="w-3 h-3" />
                  已结束
                </>
              ) : (
                <>
                  <Square className="w-3 h-3" />
                  结束对练
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Loading screen - shown while generating reference data + roles */}
        {phase === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white dark:bg-gray-900">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Swords className="w-8 h-8 text-white" />
              </div>
              <Loader2 className="w-5 h-5 animate-spin text-amber-500 absolute -bottom-1 -right-1" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1">
                准备一对一对练
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{setupProgress}</p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2">
                AI 正在分析课程内容，首次可能需要 10-20 秒
              </p>
            </div>
          </div>
        )}

        {/* Normal layout (configuring + ready + chatting + evaluating) */}
        {phase !== 'loading' && (
          <>
            {/* Left: Collapsible Panel with Tabs */}
            {!leftPanelCollapsed ? (
              <div className="w-[360px] shrink-0 border-r border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden flex flex-col">
                {/* Tab header */}
                <div className="shrink-0 px-3 py-2 flex items-center gap-1 border-b border-gray-100 dark:border-gray-800">
                  {[{ id: 'reference' as const, label: '参考资料', icon: BookOpen }].map(
                    ({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setLeftPanelTab(id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          leftPanelTab === id
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {(id as string) === 'whiteboard' && whiteboard.length > 0 && (
                          <span className="ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold bg-emerald-500 text-white leading-4">
                            {whiteboard.length}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => setLeftPanelCollapsed(true)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="收起面板"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden">
                  {(leftPanelTab as string) === 'whiteboard' ? (
                    /* ── Whiteboard panel: pinned persona card + timeline ── */
                    <div className="h-full flex flex-col overflow-hidden">
                      {/* ── Pinned persona card (always visible) ── */}
                      {(() => {
                        const persona = (
                          trainingConfig?.aiRole as
                            | {
                                name: string;
                                description: string;
                                persona?: Record<string, unknown>;
                              }
                            | undefined
                        )?.persona;
                        const infoEntries = whiteboard.filter(
                          (e) => e.type === 'info' && e.round === 0,
                        );
                        const dataEntries = whiteboard.filter(
                          (e) => e.type === 'data' && e.round === 0,
                        );
                        if (!persona && infoEntries.length === 0 && dataEntries.length === 0)
                          return null;
                        return (
                          <div className="shrink-0 mx-3 mt-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200/60 dark:border-blue-800/40 overflow-hidden">
                            {/* Card header */}
                            <div className="px-3 py-2 flex items-center gap-2 border-b border-blue-100/80 dark:border-blue-800/30">
                              <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-[10px]">
                                👤
                              </div>
                              <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300">
                                {trainingConfig?.aiRole?.name || 'AI 角色'}
                              </span>
                              <span className="ml-auto text-[9px] text-blue-400/70 dark:text-blue-500/60">
                                档案
                              </span>
                            </div>
                            {/* Card body */}
                            <div className="px-3 py-2 space-y-1">
                              {infoEntries.map((e) => (
                                <p
                                  key={e.id}
                                  className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed"
                                >
                                  {e.content}
                                </p>
                              ))}
                              {dataEntries.map((e) => (
                                <p
                                  key={e.id}
                                  className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 leading-relaxed"
                                >
                                  {e.content}
                                </p>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Timeline header ── */}
                      {whiteboard.filter((e) => e.round > 0).length > 0 && (
                        <div className="shrink-0 px-4 pt-3 pb-1 flex items-center gap-2">
                          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                          <span className="text-[10px] text-gray-400 font-medium">实时进展</span>
                          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                        </div>
                      )}

                      {/* ── Timeline entries ── */}
                      {whiteboard.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
                          <ClipboardList className="w-8 h-8 opacity-20" />
                          <p className="text-xs">对练开始后自动记录关键信息</p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
                          {whiteboard
                            .filter((e) => e.round > 0)
                            .map((entry) => {
                              const isCommitment = entry.type === 'commitment';
                              const typeConfig: Record<
                                string,
                                {
                                  label: string;
                                  icon: string;
                                  border: string;
                                  bg: string;
                                  text: string;
                                }
                              > = {
                                data: {
                                  label: '数据',
                                  icon: '📊',
                                  border: 'border-l-purple-400',
                                  bg: '',
                                  text: 'text-gray-700 dark:text-gray-300',
                                },
                                formula: {
                                  label: '公式/规则',
                                  icon: '📋',
                                  border: 'border-l-amber-400',
                                  bg: '',
                                  text: 'text-gray-700 dark:text-gray-300',
                                },
                                commitment: {
                                  label: '承诺',
                                  icon: '✅',
                                  border: 'border-l-emerald-500',
                                  bg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
                                  text: 'text-emerald-800 dark:text-emerald-200',
                                },
                                note: {
                                  label: '备注',
                                  icon: '💡',
                                  border: 'border-l-gray-300',
                                  bg: '',
                                  text: 'text-gray-600 dark:text-gray-400',
                                },
                                info: {
                                  label: '基本情况',
                                  icon: '👤',
                                  border: 'border-l-blue-400',
                                  bg: '',
                                  text: 'text-gray-700 dark:text-gray-300',
                                },
                              };
                              const cfg = typeConfig[entry.type] ?? typeConfig.note;
                              return (
                                <div
                                  key={entry.id}
                                  className={`flex items-start gap-2 border-l-2 pl-2.5 py-1.5 rounded-r-lg transition-colors ${cfg.border} ${cfg.bg} ${isCommitment ? 'pr-2 rounded-lg border border-emerald-200/60 dark:border-emerald-800/30 border-l-2' : ''}`}
                                >
                                  {/* Round badge + icon */}
                                  <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                                    <span className="text-[11px] leading-none">{cfg.icon}</span>
                                    {entry.round > 0 && (
                                      <span
                                        className={`text-[9px] font-bold leading-none ${isCommitment ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}
                                      >
                                        R{entry.round}
                                      </span>
                                    )}
                                  </div>
                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className={`text-[11px] leading-relaxed ${cfg.text} ${isCommitment ? 'font-medium' : ''}`}
                                    >
                                      {entry.content}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <ReferencePanel
                      data={referenceData}
                      loading={referenceLoading}
                      courseName={stage?.name}
                      weaknesses={weaknesses}
                      weaknessesLoading={weaknessesLoading}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Collapsed left panel — narrow bar */
              <div className="w-10 shrink-0 border-r border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col items-center py-3 gap-2">
                <button
                  onClick={() => setLeftPanelCollapsed(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="展开面板"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ══════ Middle: Whiteboard + Input (draggable split) ══════ */}
            <div
              ref={splitContainerRef}
              className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 overflow-hidden"
            >
              {/* Ready phase */}
              {phase === 'ready' && trainingConfig && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8 bg-white dark:bg-gray-900">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-6 max-w-md"
                  >
                    <div className="text-sm font-medium text-gray-400 dark:text-gray-500">
                      准备就绪
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                      {stage?.name || '一对一对练'}
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-left">
                      <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 rounded-xl p-4 border border-red-100 dark:border-red-800/30">
                        <div className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-wider mb-2">
                          👤 你的角色
                        </div>
                        <div className="text-sm font-bold text-gray-800 dark:text-white">
                          {trainingConfig.userRole.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          {trainingConfig.userRole.description}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl p-4 border border-amber-100 dark:border-amber-800/30">
                        <div className="text-[10px] font-bold text-amber-400 dark:text-amber-500 uppercase tracking-wider mb-2">
                          🤖 AI 角色
                        </div>
                        <div className="text-sm font-bold text-gray-800 dark:text-white">
                          {trainingConfig.aiRole.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          {trainingConfig.aiRole.description}
                        </div>
                      </div>
                    </div>
                    {trainingConfig.background && (
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                          {trainingConfig.background}
                        </div>
                      </div>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStartDialogue}
                      className="px-8 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2 mx-auto text-base"
                    >
                      <Play className="w-5 h-5 fill-white" />
                      开始对练
                    </motion.button>
                  </motion.div>
                </div>
              )}

              {/* Chatting / evaluating — top whiteboard area */}
              {(phase === 'chatting' || phase === 'evaluating') && (
                <>
                  {/* ── Sensitive Word Banner ── */}
                  {sensitiveWordBanner && (
                    <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-red-600 text-white text-sm font-medium shadow-md z-10">
                      <span className="text-base">🚫</span>
                      <span className="flex-1">{sensitiveWordBanner}</span>
                      <button
                        onClick={() => setSensitiveWordBanner(null)}
                        className="opacity-70 hover:opacity-100 transition-opacity text-white text-lg leading-none"
                        aria-label="关闭"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {voiceErrorBanner && (
                    <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-amber-500 text-white text-sm font-medium shadow-md z-10">
                      <MicOff className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{voiceErrorBanner}</span>
                      <button
                        onClick={() => setVoiceErrorBanner(null)}
                        className="opacity-70 hover:opacity-100 transition-opacity text-white text-lg leading-none"
                        aria-label="关闭"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {reportErrorBanner && (
                    <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-red-600 text-white text-sm font-medium shadow-md z-10">
                      <ClipboardList className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{reportErrorBanner}</span>
                      {canRetryEvaluation && !isEvaluating && (
                        <button
                          onClick={handleEndTraining}
                          className="shrink-0 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-semibold transition-colors"
                        >
                          重新生成
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setReportErrorBanner(null);
                          setCanRetryEvaluation(false);
                        }}
                        className="opacity-70 hover:opacity-100 transition-opacity text-white text-lg leading-none"
                        aria-label="关闭"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {showTimeWarning && !hasClosedWarning && (
                    <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium shadow-sm z-10">
                      <span className="text-sm shrink-0">⏰</span>
                      <span className="flex-1 text-left">
                        时间提示：本次对练剩余时间不足 60
                        秒。时间结束后您可以选择继续延长对练时间，或直接结束并生成评估报告。
                      </span>
                      <button
                        onClick={() => setHasClosedWarning(true)}
                        className="opacity-60 hover:opacity-100 transition-opacity text-amber-800 dark:text-amber-300 text-base leading-none px-1"
                        aria-label="关闭提示"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {/* Top: Whiteboard canvas — same content as left panel */}
                  <div
                    className="overflow-hidden bg-white dark:bg-gray-900 flex flex-col"
                    style={{ flex: `0 0 ${splitRatio * 100}%` }}
                  >
                    {whiteboard.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-2 select-none pointer-events-none">
                        <div className="text-4xl opacity-20">✏️</div>
                        <p className="text-xs text-gray-300 dark:text-gray-700">
                          AI 将在此记录关键内容
                        </p>
                      </div>
                    ) : (
                      <>
                        {ONE_ON_ONE_WHITEBOARD_RENDERER === 'negotiation-table' ? (
                          <NegotiationTableWhiteboard state={negotiationTableBoardState} />
                        ) : (
                          <TimelineWhiteboard
                            entries={whiteboard}
                            roleName={trainingConfig?.aiRole?.name}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Draggable divider */}
                  <div
                    onMouseDown={handleSplitMouseDown}
                    className="shrink-0 h-1.5 bg-gray-200/60 dark:bg-gray-800 hover:bg-red-400/40 cursor-row-resize group relative z-10 transition-colors"
                  >
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
                      <div className="w-8 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-red-400 transition-colors" />
                    </div>
                  </div>

                  {/* Bottom: Input area */}
                  <div
                    className="flex flex-col overflow-hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 relative"
                    style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}
                  >
                    {phase === 'chatting' && (
                      <div className="flex-1 flex items-stretch min-h-0">
                        <div className="flex-1 relative ml-2 mr-1.5 my-3">
                          <div className="relative w-full h-full rounded-[2.5rem] bg-gradient-to-b from-white/40 to-white/80 dark:from-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl border border-white/50 dark:border-gray-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col justify-center px-4 overflow-hidden group transition-all duration-700 cursor-default">
                            <AnimatePresence mode="wait">
                              {!currentTurn.userText &&
                              !currentTurn.aiText &&
                              !currentTurn.isAiStreaming ? (
                                <motion.div
                                  key="empty"
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.85 }}
                                  transition={{ duration: 0.35, ease: [0.21, 1, 0.36, 1] }}
                                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2.5"
                                >
                                  {showCurrentTurnCue ? (
                                    <>
                                      <div className="relative flex items-center justify-center">
                                        <div
                                          className={cn(
                                            'absolute w-24 h-24 rounded-full blur-2xl',
                                            asrEnabled
                                              ? 'bg-amber-400/[0.08] dark:bg-amber-500/[0.06]'
                                              : 'bg-red-400/[0.08] dark:bg-red-500/[0.06]',
                                          )}
                                        />
                                        <motion.div
                                          animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
                                          transition={{
                                            repeat: Infinity,
                                            duration: 2.2,
                                            ease: 'easeOut',
                                          }}
                                          className={cn(
                                            'absolute w-11 h-11 rounded-full border',
                                            asrEnabled
                                              ? 'border-amber-400/50 dark:border-amber-500/35'
                                              : 'border-red-400/50 dark:border-red-500/35',
                                          )}
                                        />
                                        <motion.div
                                          animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
                                          transition={{
                                            repeat: Infinity,
                                            duration: 2.2,
                                            ease: 'easeOut',
                                            delay: 0.7,
                                          }}
                                          className={cn(
                                            'absolute w-11 h-11 rounded-full border',
                                            asrEnabled
                                              ? 'border-amber-300/40 dark:border-amber-400/25'
                                              : 'border-red-300/40 dark:border-red-400/25',
                                          )}
                                        />
                                        <motion.button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (asrEnabled) handleVoiceToggle();
                                            else openTextInput();
                                          }}
                                          animate={{ scale: [1, 1.05, 1] }}
                                          transition={{
                                            repeat: Infinity,
                                            duration: 2,
                                            ease: 'easeInOut',
                                          }}
                                          className={cn(
                                            'relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:shadow-xl active:scale-95 z-10 bg-gradient-to-br',
                                            asrEnabled
                                              ? 'from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600 shadow-amber-400/30 dark:shadow-amber-600/20 hover:shadow-amber-400/40 dark:hover:shadow-amber-600/30'
                                              : 'from-red-400 to-indigo-500 dark:from-red-500 dark:to-indigo-600 shadow-red-400/30 dark:shadow-red-600/20 hover:shadow-red-400/40 dark:hover:shadow-red-600/30',
                                          )}
                                        >
                                          {asrEnabled ? (
                                            <Mic className="w-[18px] h-[18px] text-white drop-shadow-sm" />
                                          ) : (
                                            <MessageSquare className="w-[18px] h-[18px] text-white drop-shadow-sm" />
                                          )}
                                        </motion.button>
                                      </div>

                                      {asrEnabled ? (
                                        <div className="flex items-center justify-center gap-[3px] h-3">
                                          {[0, 1, 2, 3, 4, 3, 2, 1, 0].map((intensity, i) => (
                                            <motion.div
                                              key={i}
                                              animate={{
                                                scaleY: [0.3, 0.5 + intensity * 0.15, 0.3],
                                                opacity: [0.3, 0.7, 0.3],
                                              }}
                                              transition={{
                                                repeat: Infinity,
                                                duration: 0.8 + (i % 3) * 0.1,
                                                delay: i * 0.08,
                                                ease: 'easeInOut',
                                              }}
                                              className="w-[2.5px] h-full origin-center rounded-full bg-amber-400/70 dark:bg-amber-500/60"
                                            />
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-[3px] h-3">
                                          {[0, 1, 2, 3, 2, 1, 0].map((intensity, i) => (
                                            <motion.div
                                              key={i}
                                              animate={{
                                                scaleY: [0.3, 0.45 + intensity * 0.15, 0.3],
                                                opacity: [0.25, 0.6, 0.25],
                                              }}
                                              transition={{
                                                repeat: Infinity,
                                                duration: 1.0 + (i % 3) * 0.15,
                                                delay: i * 0.12,
                                                ease: 'easeInOut',
                                              }}
                                              className="w-[2.5px] h-full origin-center rounded-full bg-red-400/60 dark:bg-red-500/50"
                                            />
                                          ))}
                                        </div>
                                      )}

                                      <motion.span
                                        animate={{ opacity: [0.5, 0.9, 0.5] }}
                                        transition={{
                                          repeat: Infinity,
                                          duration: 2.5,
                                          ease: 'easeInOut',
                                        }}
                                        className={cn(
                                          'text-[10px] font-medium tracking-wider',
                                          asrEnabled
                                            ? 'text-amber-600/70 dark:text-amber-400/60'
                                            : 'text-red-600/70 dark:text-red-400/60',
                                        )}
                                      >
                                        轮到你
                                      </motion.span>
                                    </>
                                  ) : (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      正在准备一对一对话...
                                    </span>
                                  )}
                                </motion.div>
                              ) : (
                                <motion.div
                                  key={`${currentTurn.userMessageId || 'none'}-${currentTurn.aiMessageId || 'pending'}`}
                                  ref={currentTurnScrollRef}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{
                                    opacity: isRecording || isProcessing ? 0.45 : 1,
                                    y: 0,
                                    filter:
                                      isRecording || isProcessing
                                        ? 'blur(1px) grayscale(0.2)'
                                        : 'none',
                                  }}
                                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                                  transition={{ duration: 0.2, ease: [0.21, 1, 0.36, 1] }}
                                  className="w-full max-h-[calc(100%-6rem)] overflow-hidden flex flex-col gap-2 relative z-10 pb-20 pt-4"
                                >
                                  {currentTurn.userText && (
                                    <div className="flex w-full justify-end">
                                      <div className="relative pl-4 pr-11 pt-2 pb-3 rounded-2xl rounded-br-sm text-[15px] leading-relaxed border w-[min(520px,calc(100%-1rem))] flex flex-col max-h-[92px] bg-red-600/95 dark:bg-red-500/95 backdrop-blur-sm border-red-400/40 dark:border-red-300/40 text-white shadow-md shadow-red-300/30 dark:shadow-red-800/30">
                                        <div
                                          className="absolute top-2 right-3 z-20 pointer-events-none select-none"
                                          title={currentTurnUserName}
                                        >
                                          <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-red-300 dark:border-red-300 shadow-sm bg-white dark:bg-gray-800">
                                            <AvatarDisplay
                                              src={DEFAULT_USER_AVATAR}
                                              alt={currentTurnUserName}
                                            />
                                          </div>
                                        </div>
                                        <div className="overflow-hidden pr-1">
                                          <p className="whitespace-pre-wrap break-words">
                                            {currentTurn.userText}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {(currentTurn.aiText || currentTurn.isAiStreaming) && (
                                    <div className="flex w-full justify-start">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (
                                            currentTurn.isAiStreaming ||
                                            !currentTurn.aiMessageId ||
                                            !currentTurn.aiText
                                          )
                                            return;
                                          handleSpeak(
                                            currentTurn.aiMessageId,
                                            currentTurn.aiText || '',
                                          );
                                        }}
                                        className={cn(
                                          'relative pl-11 pr-4 pt-2 pb-3 rounded-2xl rounded-bl-sm text-[15px] leading-relaxed border w-[min(520px,calc(100%-1rem))] flex flex-col max-h-[110px] bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 shadow-sm hover:shadow-md text-left transition-all group/bubble',
                                          currentTurn.isAiStreaming
                                            ? 'cursor-default'
                                            : 'cursor-pointer',
                                        )}
                                        disabled={
                                          currentTurn.isAiStreaming ||
                                          !currentTurn.aiMessageId ||
                                          !currentTurn.aiText
                                        }
                                      >
                                        <div
                                          className="absolute top-2 left-3 z-20 pointer-events-none select-none"
                                          title={currentTurnAiName}
                                        >
                                          <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-red-200 dark:border-red-700 shadow-sm bg-white dark:bg-gray-800">
                                            <AvatarDisplay
                                              src={DEFAULT_TEACHER_AVATAR}
                                              alt={currentTurnAiName}
                                            />
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 truncate">
                                            {currentTurnAiName}
                                          </span>
                                          {currentTurn.isAiStreaming ? (
                                            <Loader2 className="w-3 h-3 text-amber-500 dark:text-amber-400 animate-spin" />
                                          ) : currentTurnAiIsSpeaking ? (
                                            <Volume2 className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                          ) : null}
                                        </div>
                                        <div className="overflow-hidden pr-10 break-words">
                                          {currentTurn.aiText ? (
                                            <p className="whitespace-pre-wrap break-words">
                                              {currentTurn.aiText}
                                              {currentTurn.isAiStreaming && (
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-50 animate-pulse ml-1 align-middle" />
                                              )}
                                            </p>
                                          ) : (
                                            <div className="flex gap-1 items-center py-1">
                                              {[0, 1, 2].map((dot) => (
                                                <motion.div
                                                  key={dot}
                                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                                  transition={{
                                                    repeat: Infinity,
                                                    duration: 1,
                                                    delay: dot * 0.2,
                                                  }}
                                                  className="w-1.5 h-1.5 rounded-full bg-red-400 dark:bg-red-500"
                                                />
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        {!currentTurn.isAiStreaming &&
                                          currentTurn.aiMessageId &&
                                          currentTurn.aiText && (
                                            <div className="absolute right-2.5 bottom-2.5 p-1.5 rounded-full bg-gray-50/80 dark:bg-gray-700/80 hover:bg-red-100 dark:hover:bg-red-900/50 group-hover/bubble:bg-red-100 dark:group-hover/bubble:bg-red-900/50 transition-all duration-300">
                                              {currentTurnAiIsSpeaking ? (
                                                <>
                                                  <div className="flex gap-0.5 items-end justify-center h-3.5 w-3.5 group-hover/bubble:hidden">
                                                    <motion.div
                                                      animate={{ height: ['20%', '100%', '20%'] }}
                                                      transition={{
                                                        repeat: Infinity,
                                                        duration: 0.6,
                                                      }}
                                                      className="w-1 rounded-full bg-red-500"
                                                    />
                                                    <motion.div
                                                      animate={{ height: ['40%', '100%', '40%'] }}
                                                      transition={{
                                                        repeat: Infinity,
                                                        duration: 0.4,
                                                      }}
                                                      className="w-1 rounded-full bg-red-500"
                                                    />
                                                    <motion.div
                                                      animate={{ height: ['20%', '80%', '20%'] }}
                                                      transition={{
                                                        repeat: Infinity,
                                                        duration: 0.5,
                                                      }}
                                                      className="w-1 rounded-full bg-red-500"
                                                    />
                                                  </div>
                                                  <Pause className="w-3.5 h-3.5 text-red-600 dark:text-red-400 hidden group-hover/bubble:block" />
                                                </>
                                              ) : (
                                                <Play className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 group-hover/bubble:text-red-600 dark:group-hover/bubble:text-red-400 ml-0.5" />
                                              )}
                                            </div>
                                          )}
                                      </button>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <AnimatePresence>
                              {(isRecording || isProcessing) && (
                                <motion.div
                                  key="voice-stage"
                                  initial={{ opacity: 0, scale: 0.9, x: 20, filter: 'blur(4px)' }}
                                  animate={{ opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' }}
                                  exit={{ opacity: 0, scale: 0.9, x: 20, filter: 'blur(4px)' }}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center gap-4 pr-2 pointer-events-none"
                                >
                                  <div className="flex flex-col-reverse items-end gap-1 mr-[-10px] relative z-20">
                                    <div className="flex items-center gap-0.5 h-8 px-2 py-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-xl border border-red-100 dark:border-red-800 shadow-sm">
                                      {[0, 1, 2, 3, 4, 3, 2, 1, 0].map((intensity, i) => (
                                        <motion.div
                                          key={i}
                                          animate={{
                                            scaleY: [0.3, 0.5 + intensity * 0.15, 0.3],
                                            opacity: [0.3, 0.7, 0.3],
                                          }}
                                          transition={{
                                            repeat: Infinity,
                                            duration: 0.8 + (i % 3) * 0.1,
                                            delay: i * 0.08,
                                            ease: 'easeInOut',
                                          }}
                                          className="w-[2.5px] h-full origin-center rounded-full bg-red-400/70 dark:bg-red-500/60"
                                        />
                                      ))}
                                    </div>
                                    <div className="text-[10px] font-bold tracking-widest text-red-600 dark:text-red-400 uppercase bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm border border-red-100/50 dark:border-red-800/50 mr-1">
                                      {isProcessing ? '识别中...' : '录音中...'}
                                    </div>
                                  </div>

                                  <button
                                    onClick={isRecording ? stopRecording : undefined}
                                    className="pointer-events-auto relative group cursor-pointer"
                                  >
                                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-red-600 to-indigo-700 dark:from-red-500 dark:to-indigo-600 shadow-[0_4px_20px_rgba(147,51,234,0.3)] flex items-center justify-center z-20 group-hover:scale-105 transition-transform duration-300 border border-white/20 dark:border-white/10">
                                      {isRecording ? (
                                        <MicOff className="w-6 h-6 text-white" />
                                      ) : (
                                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                                      )}
                                    </div>
                                    <div className="absolute inset-0 rounded-full border-2 border-red-500 dark:border-red-400 opacity-40 animate-[ping_2s_ease-in-out_infinite] z-10" />
                                    <div className="absolute inset-0 rounded-full border border-indigo-400 dark:border-indigo-300 opacity-20 animate-[ping_3s_ease-in-out_infinite_0.5s] z-10" />
                                    <div className="absolute inset-0 bg-red-600 dark:bg-red-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity z-0" />
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <AnimatePresence>
                              {(textInputOpen || voicePending) && (
                                <motion.div
                                  key="input-stage"
                                  initial={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(4px)' }}
                                  animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                                  exit={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(4px)' }}
                                  className="absolute inset-x-6 bottom-4 z-20 flex items-end justify-end gap-2"
                                >
                                  {textInputOpen && (
                                    <div className="relative w-fit max-w-[85%] sm:max-w-[65%] min-w-[220px] sm:min-w-[340px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-2 pr-2 rounded-2xl rounded-br-none shadow-2xl border border-red-200 dark:border-red-700 flex flex-col gap-1.5 ring-1 ring-red-100/50 dark:ring-red-800/50">
                                      <div className="flex items-end gap-2">
                                        <div className="pl-4 flex-1 py-1 min-w-0">
                                          <textarea
                                            ref={inputRef}
                                            value={inputValue}
                                            disabled={sessionDone}
                                            onChange={(e) => {
                                              if (voicePending) cancelVoiceCountdown();
                                              inputValueRef.current = e.target.value;
                                              setInputValue(e.target.value);
                                            }}
                                            onKeyDown={handleKeyDown}
                                            placeholder={sessionDone ? '对练已结束' : '输入消息...'}
                                            rows={1}
                                            className={cn(
                                              'w-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none outline-none shadow-none ring-0 text-gray-700 dark:text-gray-200 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 min-h-[36px] max-h-[90px]',
                                              sessionDone && 'cursor-not-allowed opacity-50',
                                            )}
                                            style={
                                              { fieldSizing: 'content' } as React.CSSProperties
                                            }
                                          />
                                        </div>
                                        <button
                                          onClick={handleSend}
                                          disabled={
                                            !inputValue.trim() || isAiThinking || sessionDone
                                          }
                                          className={cn(
                                            'p-2.5 text-white rounded-xl transition shadow-md mb-0.5 shrink-0',
                                            inputValue.trim() && !isAiThinking && !sessionDone
                                              ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 shadow-red-200 dark:shadow-red-900/50'
                                              : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed shadow-gray-200 dark:shadow-gray-900/50',
                                          )}
                                        >
                                          {isAiThinking ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <Send className="w-4 h-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {voicePending && (
                                    <button
                                      onClick={cancelVoiceCountdown}
                                      title="点击取消自动发送"
                                      className="relative shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl bg-white/90 dark:bg-gray-800/90 shadow-lg border border-white/60 dark:border-gray-700/60"
                                    >
                                      <svg
                                        className="absolute inset-1 w-9 h-9 -rotate-90"
                                        viewBox="0 0 36 36"
                                      >
                                        <circle
                                          cx="18"
                                          cy="18"
                                          r="15"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                          className="text-gray-200 dark:text-gray-700"
                                        />
                                        <circle
                                          cx="18"
                                          cy="18"
                                          r="15"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                          className="text-red-500"
                                          strokeDasharray="94.25 94.25"
                                          strokeDashoffset="0"
                                          strokeLinecap="round"
                                          style={{
                                            animation: 'voice-countdown-drain 2s linear forwards',
                                          }}
                                        />
                                      </svg>
                                      <span className="relative z-10 text-[11px] font-bold text-red-500">
                                        {'⇣'}
                                      </span>
                                      <style>{`@keyframes voice-countdown-drain { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 94.25; } }`}</style>
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="w-[112px] shrink-0 flex flex-col py-3 border-l border-gray-100/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/30 overflow-visible">
                          <div className="flex-1 flex items-center justify-center gap-2 px-1.5 min-h-0">
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {isAiThinking ? (
                                <div className="flex items-center justify-center w-8 h-8">
                                  <div className="flex items-center gap-[3px]">
                                    {[0, 1, 2].map((i) => (
                                      <motion.div
                                        key={i}
                                        animate={{
                                          y: [0, -3, 0],
                                          opacity: [0.35, 0.9, 0.35],
                                        }}
                                        transition={{
                                          repeat: Infinity,
                                          duration: 0.9,
                                          delay: i * 0.12,
                                          ease: 'easeInOut',
                                        }}
                                        className="w-[4px] h-[4px] rounded-full bg-red-400 dark:bg-red-400"
                                      />
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVoiceToggle();
                                    }}
                                    disabled={!asrEnabled || sessionDone || isProcessing}
                                    className={cn(
                                      'w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-95 shadow-sm',
                                      !asrEnabled || sessionDone
                                        ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                        : isRecording || preferredInputMode === 'voice'
                                          ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500 text-white shadow-red-200 dark:shadow-red-800'
                                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700',
                                    )}
                                  >
                                    {asrEnabled ? (
                                      <Mic className="w-3.5 h-3.5" />
                                    ) : (
                                      <MicOff className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTextInputToggle();
                                    }}
                                    disabled={sessionDone}
                                    className={cn(
                                      'w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-95 shadow-sm',
                                      sessionDone
                                        ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                        : textInputOpen || preferredInputMode === 'text'
                                          ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500 text-white shadow-red-200 dark:shadow-red-800'
                                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700',
                                    )}
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>

                            <div
                              className="relative group cursor-pointer shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTextInputToggle();
                              }}
                            >
                              <div
                                className={cn(
                                  'relative w-14 h-14 rounded-full transition-all duration-300 flex items-center justify-center',
                                  showCurrentTurnCue ||
                                    currentTurn.userText ||
                                    isRecording ||
                                    isProcessing
                                    ? 'scale-105'
                                    : 'opacity-50 grayscale-[0.2] scale-95 group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-100',
                                )}
                              >
                                <div
                                  className={cn(
                                    'absolute inset-0 rounded-full border-2 transition-all duration-300',
                                    showCurrentTurnCue
                                      ? 'border-amber-500 dark:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse'
                                      : currentTurn.userText || isRecording || isProcessing
                                        ? 'border-red-600 dark:border-red-400 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                                        : 'border-white dark:border-gray-700 group-hover:border-red-200 dark:group-hover:border-red-600',
                                  )}
                                />
                                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 overflow-hidden relative z-10 shadow-sm border border-gray-50 dark:border-gray-700 text-2xl">
                                  <AvatarDisplay
                                    src={DEFAULT_USER_AVATAR}
                                    alt={currentTurnUserName}
                                  />
                                </div>
                                <div className="absolute top-0 right-0 w-5 h-5 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-md border border-gray-100 dark:border-gray-700 z-20">
                                  <div
                                    className={cn(
                                      'w-1.5 h-1.5 rounded-full',
                                      showCurrentTurnCue || currentTurn.userText || isRecording
                                        ? 'bg-red-500 animate-pulse'
                                        : 'bg-gray-300 dark:bg-gray-600',
                                    )}
                                  />
                                </div>
                              </div>
                              <span className="block max-w-[72px] truncate mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-sm bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 text-center">
                                {currentTurnUserName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestEndTrainingConfirmation();
                                }}
                                disabled={isEvaluating || sessionDone}
                                className={cn(
                                  'mt-1 w-full max-w-[72px] h-7 rounded-full flex items-center justify-center gap-1 transition-all text-[10px] font-medium shadow-sm border',
                                  isEvaluating || sessionDone
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600 border-gray-200 dark:border-gray-700'
                                    : 'bg-white dark:bg-gray-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-700',
                                )}
                              >
                                <Square className="w-2.5 h-2.5" />
                                {sessionDone ? '已结束' : '结束'}
                              </button>
                              <AnimatePresence>
                                {showCurrentTurnCue && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-full shadow-sm z-30"
                                  >
                                    轮到你
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {phase === 'evaluating' && (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <Loader2 className="w-5 h-5 animate-spin text-red-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          正在生成评估报告，通常需要 30-90 秒...
                        </p>
                      </div>
                    )}
                    {/* End suggestion — removed from here, shown in right panel instead */}
                  </div>
                </>
              )}
            </div>

            {/* ══════ Right: Chat Messages Panel (collapsible) ══════ */}
            {(phase === 'chatting' || phase === 'evaluating') && (
              <>
                {!rightPanelCollapsed ? (
                  <div className="w-[400px] shrink-0 border-l border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        对话记录
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400">
                        {messages.length} 条
                      </span>
                      <button
                        onClick={() => setRightPanelCollapsed(true)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="收起对话面板"
                      >
                        <PanelRightClose className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* SESSION_COMPLETE banner moved to above input in middle column */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
                      <AnimatePresence initial={false}>
                        {messages.map((msg) =>
                          msg.role === 'system' ? (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="w-full flex justify-center py-2"
                            >
                              <div className="w-full bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 dark:from-amber-950/20 dark:via-orange-950/10 dark:to-amber-950/20 border border-orange-500/20 dark:border-orange-900/30 rounded-2xl p-4 text-xs space-y-3 shadow-sm text-left">
                                <div className="flex items-center gap-2 font-bold text-orange-600 dark:text-orange-400">
                                  <span className="text-sm">👩‍🏫</span>
                                  <span>对练指南 · 系统指引</span>
                                </div>

                                {msg.content && (
                                  <p className="leading-relaxed text-orange-700 dark:text-orange-300">
                                    {msg.content}
                                  </p>
                                )}

                                <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                  <span className="block font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                                    场景背景
                                  </span>
                                  <p className="leading-relaxed">{trainingConfig?.background}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                    <span className="block font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                                      您的身份
                                    </span>
                                    <p className="font-semibold text-red-600 dark:text-red-400 text-xs">
                                      {trainingConfig?.userRole?.name}
                                    </p>
                                  </div>
                                  <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                    <span className="block font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                                      对练对象
                                    </span>
                                    <p className="font-semibold text-amber-600 dark:text-amber-400 text-xs">
                                      {trainingConfig?.aiRole?.name}
                                    </p>
                                  </div>
                                </div>

                                {visibleKnowledgePoints.length > 0 && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-dashed border-orange-500/10 dark:border-orange-900/20">
                                    <span className="block font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                                      通关考核要点
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {visibleKnowledgePoints.map((kp, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-medium"
                                        >
                                          {kp.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                'flex gap-2',
                                msg.role === 'user' && 'flex-row-reverse',
                              )}
                            >
                              <div
                                className={cn(
                                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold',
                                  msg.role === 'user'
                                    ? 'bg-gradient-to-br from-red-500 to-red-600'
                                    : 'bg-gradient-to-br from-amber-400 to-orange-500',
                                )}
                              >
                                {msg.role === 'user' ? '你' : 'AI'}
                              </div>
                              <div
                                className={cn('max-w-[85%]', msg.role === 'user' && 'text-right')}
                              >
                                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-0.5">
                                  {msg.role === 'user'
                                    ? trainingConfig?.userRole?.name || '你'
                                    : trainingConfig?.aiRole?.name || 'AI'}
                                </span>
                                {!msg.trainingReport ? (
                                  <>
                                    <div
                                      className={cn(
                                        'inline-block px-3 py-2 rounded-2xl text-[13px] leading-relaxed',
                                        msg.role === 'user'
                                          ? 'bg-gradient-to-br from-red-500 to-red-600 text-white rounded-tr-md'
                                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-tl-md',
                                      )}
                                    >
                                       {msg.content}
                                    </div>
                                    {msg.role === 'user' && msg.audioUrl && (
                                      <button
                                        onClick={() => handlePlayAudio(msg.audioUrl!)}
                                        className={cn(
                                          'mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-all ml-auto',
                                          playingAudioUrl === msg.audioUrl
                                            ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50',
                                        )}
                                      >
                                        {playingAudioUrl === msg.audioUrl ? (
                                          <>
                                            <VolumeX className="w-3 h-3" /> 停止
                                          </>
                                        ) : (
                                          <>
                                            <Volume2 className="w-3 h-3" /> 播放语音
                                          </>
                                        )}
                                      </button>
                                    )}
                                    {msg.role === 'assistant' && msg.content && (
                                      <button
                                        onClick={() => handleSpeak(msg.id, msg.content)}
                                        className={cn(
                                          'mt-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-all',
                                          speakingMsgId === msg.id
                                            ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50',
                                        )}
                                      >
                                        {speakingMsgId === msg.id ? (
                                          <>
                                            <VolumeX className="w-3 h-3" /> 停止
                                          </>
                                        ) : (
                                          <>
                                            <Volume2 className="w-3 h-3" /> 播放
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <div className="space-y-3">
                                    <TrainingReportCard report={msg.trainingReport} />
                                    {msg.id === lastReportMsgId && sessionDone && currentSessionId && (
                                      <div className="flex flex-col gap-1 items-start">
                                        <button
                                          type="button"
                                          disabled={reevaluating}
                                          onClick={handleReevaluate}
                                          className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all",
                                            reevaluating
                                              ? "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed"
                                              : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                                          )}
                                        >
                                          <RefreshCw className={cn("w-3.5 h-3.5", reevaluating && "animate-spin")} />
                                          {reevaluating ? "重新评估中..." : "重新评估(最新配置)"}
                                        </button>
                                        {reeevaluateError && (
                                          <span className="text-[10px] text-red-500 font-medium">
                                            重新评估失败: {reeevaluateError}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ),
                        )}
                      </AnimatePresence>
                      {isAiThinking && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex gap-2"
                        >
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            AI
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"
                              style={{ animationDelay: '200ms' }}
                            />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"
                              style={{ animationDelay: '400ms' }}
                            />
                          </div>
                        </motion.div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                ) : (
                  <div className="w-10 shrink-0 border-l border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col items-center py-3 gap-2">
                    <button
                      onClick={() => setRightPanelCollapsed(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="展开对话面板"
                    >
                      <PanelRightOpen className="w-3.5 h-3.5" />
                    </button>
                    {messages.length > 0 && (
                      <span className="text-[9px] font-bold text-gray-400">{messages.length}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Expanded Report Modal (Handled internally by TrainingReportCard) ── */}
      {null}

      {/* Character Selection Overlay */}
      <CharacterSelectionOverlay
        open={showConfigModal}
        defaultConfig={roleConfig}
        loading={false}
        onStart={handleTrainingStart}
        onClose={() => {
          setShowConfigModal(false);
          if (!trainingConfig) {
            router.push('/');
          }
        }}
        onRegenerate={handleRegenerateRoles}
        regenerating={isRegenerating}
      />

      {/* History Drawer */}
      <HistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        stageId={stage?.id || ''}
        stageName={stage?.name}
      />

      {/* ⏳ Timeout Dialog */}
      <AnimatePresence>
        {showTimeoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: [0.21, 1, 0.36, 1] }}
              className="relative w-full max-w-md rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 text-center shadow-2xl overflow-hidden"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-500 text-2xl mb-4 animate-bounce">
                ⏳
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                ⏳ 对练时长已满
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                您的单次对练时间已达到最大限制。您可以选择延长对练时间以继续练习，或者立即结束对练并由
                AI 评估生成评分报告。
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => handleExtend(10)}
                  className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-indigo-600 hover:from-red-600 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all active:scale-98"
                >
                  继续对练 (+10分钟)
                </button>
                <button
                  onClick={() => {
                    setShowTimeoutModal(false);
                    handleEndTraining();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700/60"
                >
                  结束对练并生成报告
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showEndSuggestion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-6 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-4 text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                  {endSuggestionSource === 'manual' ? (
                    <ClipboardList className="w-5 h-5 text-white" />
                  ) : (
                    <span className="text-lg">🎯</span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    {endSuggestionSource === 'manual'
                      ? '确认结束本次对练？'
                      : 'AI 建议结束本次对练'}
                  </h3>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {endSuggestionSource === 'manual'
                      ? '确认后将生成本次对练的评估报告'
                      : 'AI 已判定当前的沟通对练达到了结案阶段'}
                  </p>
                </div>
              </div>

              <div className="mb-6 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 p-4 text-left">
                <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                  {endSuggestionSource === 'manual' ? '确认操作' : '建议原因'}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                  {endSuggestionReason}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowEndSuggestion(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
                >
                  继续对练
                </button>
                <button
                  onClick={() => {
                    setShowEndSuggestion(false);
                    handleEndTraining();
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:scale-95 shadow-lg shadow-red-500/10 rounded-xl transition-all"
                >
                  {endSuggestionSource === 'manual' ? '结束对练，生成报告' : '结束对练，查看评估'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
