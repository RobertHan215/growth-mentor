'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, RefreshCw, Loader2, ChevronRight, Plus, Trash2, ExternalLink, Upload } from 'lucide-react';
import Link from 'next/link';
import { nanoid } from 'nanoid';
import { generateAndStoreTTS } from '@/lib/hooks/use-scene-generator';
import { db as indexedDB } from '@/lib/utils/database';
import { saveStageOutlines } from '@/lib/hybrid-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';

interface SceneOutline {
  id: string;
  type: string;
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  order: number;
  language?: string;
  quizConfig?: { questionCount: number; difficulty: string; questionTypes: string[] };
  interactiveConfig?: { conceptName: string; conceptOverview: string; designIdea: string };
  pblConfig?: { projectTopic: string; projectDescription: string; targetSkills: string[] };
  [key: string]: unknown;
}

interface Scene {
  id: string;
  stageId: string;
  type: string;
  title: string;
  order: number;
  content: unknown;
  actions: unknown;
}

interface StageInfo {
  id: string;
  name: string;
  description?: string;
  language?: string;
}

interface EditableAction {
  id?: string;
  type?: string;
  text?: string;
  audioId?: string;
  elementId?: string;
  topic?: string;
  [key: string]: unknown;
}

interface EditableTextElement {
  id?: string;
  type?: string;
  content?: unknown;
  src?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
  defaultFontName?: string;
  defaultColor?: string;
  [key: string]: unknown;
}

interface EditableCanvas {
  id?: string;
  viewportSize?: number;
  viewportRatio?: number;
  theme?: {
    fontName?: string;
    fontColor?: string;
    [key: string]: unknown;
  };
  elements?: EditableTextElement[];
  [key: string]: unknown;
}

interface EditableQuizQuestion {
  id?: string;
  type: 'single' | 'multiple' | 'short_answer';
  question: string;
  options?: { label: string; value: string }[];
  answer?: string[];
  analysis?: string;
  points?: number;
  [key: string]: unknown;
}

interface EditableContent {
  type?: string;
  canvas?: EditableCanvas;
  questions?: EditableQuizQuestion[];
  [key: string]: unknown;
}

const SCENE_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  slide: { label: '幻灯片', emoji: '📖' },
  quiz: { label: '测验', emoji: '❓' },
  interactive: { label: '互动', emoji: '🧪' },
  pbl: { label: 'PBL', emoji: '🏗️' },
};

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, '').trim();

const PPT_PREVIEW_WIDTH = 560;

const getEditableActions = (actions: unknown): EditableAction[] =>
  Array.isArray(actions) ? (actions as EditableAction[]) : [];

const cloneSceneContent = (content: unknown): EditableContent =>
  JSON.parse(JSON.stringify(content || {})) as EditableContent;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getInlineStyleValue = (html: unknown, property: string) => {
  if (typeof html !== 'string') return null;
  const match = html.match(new RegExp(`${property}\\s*:\\s*([^;"']+)`, 'i'));
  return match?.[1]?.trim() || null;
};

const getInlineFontSize = (html: unknown) => {
  const value = getInlineStyleValue(html, 'font-size');
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readImageFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('图片读取失败'));
    };
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

const buildSlideTextContent = (currentContent: unknown, newText: string, fallbackToParagraph = false) => {
  const current = typeof currentContent === 'string' ? currentContent : '';
  const wrapperMatch = current.match(/^(<(?:p|div)[^>]*>)([\s\S]*?)(<\/(?:p|div)>)$/i);
  if (wrapperMatch) {
    return `${wrapperMatch[1]}${newText}${wrapperMatch[3]}`;
  }
  return fallbackToParagraph ? `<p style="font-size: 22px;">${newText}</p>` : newText;
};

const getSpeechActionKey = (action: EditableAction | undefined, actionIdx: number) =>
  typeof action?.id === 'string' && action.id ? action.id : `idx-${actionIdx}`;

const copyTextElementStyle = (source: EditableTextElement | null, target: EditableTextElement) => {
  [
    'outline',
    'fill',
    'lineHeight',
    'wordSpace',
    'opacity',
    'shadow',
    'paragraphSpace',
    'vertical',
    'textType',
  ].forEach((field) => {
    if (source?.[field] !== undefined) target[field] = source[field];
  });
};

// ==================== Quiz Question Editor ====================

interface QuizQuestionEditorProps {
  question: EditableQuizQuestion;
  index: number;
  onChange: (field: string, value: unknown) => void;
  onDelete?: () => void;
}

function QuizQuestionEditor({ question, index, onChange, onDelete }: QuizQuestionEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const isChoice = question.type === 'single' || question.type === 'multiple';
  const options = question.options || [
    { label: '', value: 'A' },
    { label: '', value: 'B' },
    { label: '', value: 'C' },
    { label: '', value: 'D' },
  ];
  const answer = question.answer || [];

  const toggleAnswer = (value: string) => {
    if (question.type === 'single') {
      onChange('answer', [value]);
    } else {
      const newAnswer = answer.includes(value)
        ? answer.filter(v => v !== value)
        : [...answer, value];
      onChange('answer', newAnswer);
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      {/* Header - always visible, click to expand */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors -ml-2 pl-2 rounded"
        >
          <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <span className="text-xs text-slate-400 font-medium w-6 shrink-0">{index + 1}.</span>
          <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 line-clamp-1">
            {question.question || '(无题目文本)'}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
            question.type === 'single' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
            question.type === 'multiple' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
            'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
            {question.type === 'single' ? '单选' : question.type === 'multiple' ? '多选' : '简答'}
          </span>
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors shrink-0"
            title="删除此题"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-700 pt-3">
          {/* Question type selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">考题类型</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange('type', 'single')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  question.type === 'single'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                单选
              </button>
              <button
                type="button"
                onClick={() => onChange('type', 'multiple')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  question.type === 'multiple'
                    ? 'bg-purple-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                多选
              </button>
              <button
                type="button"
                onClick={() => onChange('type', 'short_answer')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  question.type === 'short_answer'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                简答
              </button>
            </div>
          </div>

          {/* Question text */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">题目</label>
            <textarea
              value={question.question || ''}
              onChange={e => onChange('question', e.target.value)}
              rows={2}
              className="w-full text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-200 resize-none"
              placeholder="请输入题目内容..."
            />
          </div>

          {/* Options - only for choice questions */}
          {isChoice && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">选项</label>
              <div className="grid grid-cols-2 gap-2">
                {options.map((opt, optIdx) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      answer.includes(opt.value)
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {opt.value}
                    </span>
                    <input
                      type="text"
                      value={opt.label}
                      onChange={e => {
                        const newOptions = [...options];
                        newOptions[optIdx] = { ...opt, label: e.target.value };
                        onChange('options', newOptions);
                      }}
                      className="flex-1 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-200"
                      placeholder={`选项 ${opt.value}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correct answer selector - only for choice questions */}
          {isChoice && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                正确答案{question.type === 'multiple' ? '（可多选）' : ''}
              </label>
              <div className="flex gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAnswer(opt.value)}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                      answer.includes(opt.value)
                        ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 dark:ring-emerald-700'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {opt.value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Short answer expected answer */}
          {question.type === 'short_answer' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">期望答案（AI 评分参考）</label>
              <input
                type="text"
                value={answer[0] || ''}
                onChange={e => onChange('answer', [e.target.value])}
                className="w-full text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-200"
                placeholder="输入期望答案关键词..."
              />
            </div>
          )}

          {/* Analysis */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">答案解析</label>
            <textarea
              value={question.analysis || ''}
              onChange={e => onChange('analysis', e.target.value)}
              rows={2}
              className="w-full text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-200 resize-none"
              placeholder="选填：答案解析..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params?.id as string;

  const [stage, setStage] = useState<StageInfo | null>(null);
  const [outlines, setOutlines] = useState<SceneOutline[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [modifiedSceneIds, setModifiedSceneIds] = useState<Set<string>>(new Set());
  const [savingScene, setSavingScene] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  // Track original speech texts by action id to detect which audio cache should be invalidated.
  const [originalSpeechTexts, setOriginalSpeechTexts] = useState<Record<string, Record<string, string>>>({});
  const [deletedSpeechAudioIds, setDeletedSpeechAudioIds] = useState<Record<string, string[]>>({});
  const [deletedSlideTextTemplates, setDeletedSlideTextTemplates] = useState<Record<string, EditableTextElement>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stageRes, outlinesRes, scenesRes] = await Promise.all([
        fetch(`/api/db/stage?stageId=${encodeURIComponent(courseId)}`),
        fetch(`/api/admin/courses/${courseId}/outlines`),
        fetch(`/api/db/scene?stageId=${encodeURIComponent(courseId)}`),
      ]);

      if (stageRes.ok) {
        const sj = await stageRes.json();
        setStage(sj.data || sj);
      }
      if (outlinesRes.ok) {
        const oj = await outlinesRes.json();
        // API returns { success, data: { stageId, outlines, ... } } or data: null
        // Prisma Json field: outlines could be array directly or nested
        let outlineData: SceneOutline[] = [];
        const raw = oj.data?.outlines ?? oj.outlines ?? oj.data;
        if (Array.isArray(raw)) {
          outlineData = raw;
        } else if (raw && typeof raw === 'object' && Array.isArray(raw.outlines)) {
          outlineData = raw.outlines;
        }
        console.log('[CourseDetail] outlines API response:', { dataKeys: oj.data ? Object.keys(oj.data) : 'null', rawType: typeof raw, isArray: Array.isArray(raw), length: outlineData.length });
        setOutlines(outlineData);
      }
      if (scenesRes.ok) {
        const scj = await scenesRes.json();
        const data = scj.data || scj;
        setScenes(Array.isArray(data) ? data.sort((a: Scene, b: Scene) => a.order - b.order) : []);
      }
      setDirty(false);
      setModifiedSceneIds(new Set());
      setOriginalSpeechTexts({});
      setDeletedSpeechAudioIds({});
      setDeletedSlideTextTemplates({});
    } catch {
      toast.error('加载课程数据失败');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateOutlineField = (idx: number, field: string, value: unknown) => {
    setOutlines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setDirty(true);
  };

  const updateKeyPoint = (outlineIdx: number, kpIdx: number, value: string) => {
    setOutlines(prev => {
      const next = [...prev];
      const kps = [...(next[outlineIdx].keyPoints || [])];
      kps[kpIdx] = value;
      next[outlineIdx] = { ...next[outlineIdx], keyPoints: kps };
      return next;
    });
    setDirty(true);
  };

  const addKeyPoint = (outlineIdx: number) => {
    setOutlines(prev => {
      const next = [...prev];
      next[outlineIdx] = { ...next[outlineIdx], keyPoints: [...(next[outlineIdx].keyPoints || []), ''] };
      return next;
    });
    setDirty(true);
  };

  const removeKeyPoint = (outlineIdx: number, kpIdx: number) => {
    setOutlines(prev => {
      const next = [...prev];
      const kps = [...(next[outlineIdx].keyPoints || [])];
      kps.splice(kpIdx, 1);
      next[outlineIdx] = { ...next[outlineIdx], keyPoints: kps };
      return next;
    });
    setDirty(true);
  };

  const setSceneDirty = (val: boolean, sceneId?: string) => {
    if (val && sceneId) {
      setModifiedSceneIds(prev => new Set(prev).add(sceneId));
    } else if (!val) {
      setModifiedSceneIds(new Set());
    }
  };

  const updateSpeechText = (sceneId: string, actionIdx: number, newText: string) => {
    // Record original text on first edit
    const scene = scenes.find(s => s.id === sceneId);
    const action = getEditableActions(scene?.actions)[actionIdx];
    const actionKey = getSpeechActionKey(action, actionIdx);
    setOriginalSpeechTexts(prev => {
      if (prev[sceneId]?.[actionKey] !== undefined) return prev;
      const origText = action?.text || '';
      return { ...prev, [sceneId]: { ...prev[sceneId], [actionKey]: origText } };
    });
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const actions = [...getEditableActions(s.actions)];
      actions[actionIdx] = { ...actions[actionIdx], text: newText };
      return { ...s, actions };
    }));
    setSceneDirty(true, sceneId);
  };

  const updateSlideText = (sceneId: string, elementIdx: number, newText: string) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const content = cloneSceneContent(s.content);
      if (content.canvas?.elements) {
        const el = content.canvas.elements[elementIdx];
        if (el) {
          el.content = buildSlideTextContent(el.content, newText);
        }
      }
      return { ...s, content };
    }));
    setSceneDirty(true, sceneId);
  };

  const addSlideText = (sceneId: string) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const content = cloneSceneContent(s.content);
      if (content.type !== 'slide') return s;

      const canvas = content.canvas || {};
      const elements = Array.isArray(canvas.elements) ? [...canvas.elements] : [];
      const textElements = elements.filter((el) => el?.type === 'text');
      const cachedTemplate = deletedSlideTextTemplates[sceneId] || null;
      const template = cachedTemplate || (textElements.length > 0 ? textElements[textElements.length - 1] : null);
      const viewportSize = typeof canvas.viewportSize === 'number' ? canvas.viewportSize : 1000;
      const viewportRatio = typeof canvas.viewportRatio === 'number' ? canvas.viewportRatio : 0.5625;
      const viewportHeight = viewportSize * viewportRatio;
      const height = typeof template?.height === 'number' ? template.height : 56;
      const width = typeof template?.width === 'number' ? template.width : Math.max(240, viewportSize - 160);
      const left = typeof template?.left === 'number' ? template.left : 80;
      const baseTop = typeof template?.top === 'number' ? template.top : 120;
      let top = cachedTemplate ? baseTop : template ? baseTop + height + 16 : baseTop;
      const maxTop = Math.max(24, viewportHeight - height - 24);
      if (top > maxTop) top = maxTop;

      const newElement: EditableTextElement = {
        id: `text_${nanoid(8)}`,
        type: 'text',
        content: buildSlideTextContent(template?.content, '新增文字', true),
        left,
        top,
        width,
        height,
        rotate: typeof template?.rotate === 'number' ? template.rotate : 0,
        defaultFontName: template?.defaultFontName || canvas.theme?.fontName || 'Microsoft YaHei',
        defaultColor: template?.defaultColor || canvas.theme?.fontColor || '#333333',
      };
      copyTextElementStyle(template, newElement);

      content.canvas = {
        ...canvas,
        id: canvas.id || `slide_${nanoid(8)}`,
        viewportSize,
        viewportRatio,
        elements: [...elements, newElement],
      };

      return { ...s, content };
    }));
    setDeletedSlideTextTemplates(prev => {
      if (!prev[sceneId]) return prev;
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
    setSceneDirty(true, sceneId);
  };

  const deleteSlideElement = (sceneId: string, elementIdx: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    const deletedElement = (scene?.content as EditableContent | undefined)?.canvas?.elements?.[elementIdx];
    if (deletedElement?.type === 'text') {
      setDeletedSlideTextTemplates(prev => ({
        ...prev,
        [sceneId]: JSON.parse(JSON.stringify(deletedElement)) as EditableTextElement,
      }));
    }

    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const content = cloneSceneContent(s.content);
      if (Array.isArray(content.canvas?.elements)) {
        content.canvas.elements.splice(elementIdx, 1);
      }
      return { ...s, content };
    }));
    setSceneDirty(true, sceneId);
  };

  const replaceSlideImage = async (sceneId: string, elementIdx: number, file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    try {
      const src = await readImageFileAsDataUrl(file);
      setScenes(prev => prev.map(s => {
        if (s.id !== sceneId) return s;
        const content = cloneSceneContent(s.content);
        const el = content.canvas?.elements?.[elementIdx];
        if (el?.type === 'image') {
          el.src = src;
        }
        return { ...s, content };
      }));
      setSceneDirty(true, sceneId);
      toast.success('图片已更换，请保存修改');
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '图片读取失败'));
    }
  };

  const addSpeechText = (sceneId: string) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const actions = [...getEditableActions(s.actions)];
      const lastSpeechIdx = actions.reduce((lastIdx, action, idx) => action?.type === 'speech' ? idx : lastIdx, -1);
      const discussionIdx = actions.findIndex(action => action?.type === 'discussion');
      const insertIdx = lastSpeechIdx >= 0
        ? lastSpeechIdx + 1
        : discussionIdx >= 0 ? discussionIdx : actions.length;
      actions.splice(insertIdx, 0, {
        id: `action_${nanoid(8)}`,
        type: 'speech',
        text: '新增讲稿',
      });
      return { ...s, actions };
    }));
    setSceneDirty(true, sceneId);
  };

  const deleteSpeechText = (sceneId: string, actionIdx: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    const action = getEditableActions(scene?.actions)[actionIdx];
    const audioId = action?.audioId;
    if (audioId) {
      setDeletedSpeechAudioIds(prev => ({
        ...prev,
        [sceneId]: Array.from(new Set([...(prev[sceneId] || []), audioId])),
      }));
    }

    const actionKey = getSpeechActionKey(action, actionIdx);
    setOriginalSpeechTexts(prev => {
      if (prev[sceneId]?.[actionKey] === undefined) return prev;
      const nextSceneTexts = { ...prev[sceneId] };
      delete nextSceneTexts[actionKey];
      return { ...prev, [sceneId]: nextSceneTexts };
    });

    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const actions = [...getEditableActions(s.actions)];
      actions.splice(actionIdx, 1);
      return { ...s, actions };
    }));
    setSceneDirty(true, sceneId);
  };

  const updateQuizQuestion = (sceneId: string, questionIdx: number, field: string, value: unknown) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const content = cloneSceneContent(s.content);
      if (content.questions?.[questionIdx]) {
        content.questions[questionIdx][field] = value;
      }
      return { ...s, content };
    }));
    setSceneDirty(true, sceneId);
  };

  const deleteQuizQuestion = (sceneId: string, questionIdx: number) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const content = cloneSceneContent(s.content);
      if (Array.isArray(content.questions)) {
        content.questions.splice(questionIdx, 1);
      }
      return { ...s, content };
    }));
    setSceneDirty(true, sceneId);
  };

  const deleteQuizScene = async (sceneId: string) => {
    if (!confirm('确定要删除整个测验吗？此操作不可撤销。')) return;
    try {
      const res = await fetch('/api/db/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', data: { id: sceneId } }),
      });
      if (!res.ok) throw new Error('删除失败');
      setScenes(prev => prev.filter(s => s.id !== sceneId));
      toast.success('测验已删除');
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '删除失败'));
    }
  };

  const deleteOutline = async (outlineIdx: number) => {
    const outline = outlines[outlineIdx];
    if (!outline) return;
    if (!confirm(`确定要删除章节「${outline.title || `第${outlineIdx + 1}章`}」吗？此操作不可恢复。`)) return;

    try {
      // Delete associated scene if exists (outline.id === scene.id)
      const sceneToDelete = scenes.find(s => s.id === outline.id);
      if (sceneToDelete) {
        await fetch('/api/db/scene', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', data: { id: sceneToDelete.id } }),
        });
        // Also delete from IndexedDB cache so preview shows updated data
        await indexedDB.scenes.delete(sceneToDelete.id);
        setScenes(prev => prev.filter(s => s.id !== sceneToDelete.id));
      }

      // Update outlines locally
      const newOutlines = outlines.filter((_, i) => i !== outlineIdx);
      setOutlines(newOutlines);
      setDirty(true);

      // Adjust selected index if needed
      if (selectedIdx >= newOutlines.length) {
        setSelectedIdx(Math.max(0, newOutlines.length - 1));
      }

      toast.success('章节已删除');
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '删除失败'));
    }
  };

  const handleSaveAll = async () => {
    let savedSomething = false;

    // 1. Save Outlines if dirty
    if (dirty) {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/courses/${courseId}/outlines`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outlines }),
        });
        if (!res.ok) throw new Error('保存大纲失败');
        // Also update IndexedDB cache so preview shows updated data
        await saveStageOutlines({ stageId: courseId, outlines });
        setDirty(false);
        savedSomething = true;
      } catch (e: unknown) {
        toast.error(getErrorMessage(e, '保存大纲失败'));
      } finally {
        setSaving(false);
      }
    }

    // 2. Save modified scenes
    if (modifiedSceneIds.size > 0) {
      setSavingScene(true);
      try {
        let deletedAudioCount = 0;
        
        for (const sceneId of Array.from(modifiedSceneIds)) {
          const scene = scenes.find(s => s.id === sceneId);
          if (!scene) continue;

          const actions = getEditableActions(scene.actions);
          const origTexts = originalSpeechTexts[scene.id] || {};

          // Find modified speech actions and delete their old audio
          const audioIdsToDelete: string[] = [...(deletedSpeechAudioIds[scene.id] || [])];
          const updatedActions = actions.map((action, idx) => {
            if (action.type !== 'speech' || !action.audioId) return action;
            const origText = origTexts[getSpeechActionKey(action, idx)];
            if (origText !== undefined && origText !== action.text) {
              audioIdsToDelete.push(action.audioId);
              const { audioId: _removed, ...rest } = action;
              return rest;
            }
            return action;
          });

          // Delete old audio files from database
          const uniqueAudioIdsToDelete = Array.from(new Set(audioIdsToDelete));
          for (const audioId of uniqueAudioIdsToDelete) {
            try {
              await fetch(`/api/db/audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', data: { id: audioId } }),
              });
            } catch {}
          }
          deletedAudioCount += uniqueAudioIdsToDelete.length;

          // Save updated actions & content
          const res = await fetch(`/api/db/scene`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              data: { id: scene.id, actions: updatedActions, content: scene.content },
            }),
          });
          if (!res.ok) throw new Error(`保存章节数据失败: ${scene.title}`);

          // Update local state with cleared audioIds
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, actions: updatedActions } : s));
          setOriginalSpeechTexts(prev => ({ ...prev, [scene.id]: {} }));
          setDeletedSpeechAudioIds(prev => ({ ...prev, [scene.id]: [] }));
        }

        if (deletedAudioCount > 0) {
          toast.success(`修改已保存，已清理 ${deletedAudioCount} 段旧语音，可重新生成语音`);
        } else if (!savedSomething) {
          toast.success('章节内容修改已保存');
        }
        setModifiedSceneIds(new Set());
        savedSomething = true;
      } catch (e: unknown) {
        toast.error(getErrorMessage(e, '保存章节数据失败'));
      } finally {
        setSavingScene(false);
      }
    }

    if (savedSomething && modifiedSceneIds.size === 0) {
      toast.success('所有修改已保存');
    }
  };

  const generateSceneAudio = async (scene: Scene) => {
    setGeneratingAudio(true);
    try {
      const actions = getEditableActions(scene.actions);
      let updatedCount = 0;
      const updatedActions = [...actions];

      toast.info('开始生成语音，请稍候...');

      for (let i = 0; i < updatedActions.length; i++) {
        const action = updatedActions[i];
        // Only generate for speech actions that lack an audioId (i.e., newly modified and saved)
        if (action.type === 'speech' && !action.audioId && action.text) {
          const newAudioId = `tts_${action.id || Date.now()}_${Date.now()}`;
          await generateAndStoreTTS(newAudioId, action.text);
          updatedActions[i] = { ...action, audioId: newAudioId };
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        // Save the updated actions with new audioIds to DB
        const res = await fetch(`/api/db/scene`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            data: { id: scene.id, actions: updatedActions, content: scene.content },
          }),
        });
        if (!res.ok) throw new Error('保存语音状态失败');

        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, actions: updatedActions } : s));
        toast.success(`成功生成 ${updatedCount} 段最新语音`);
      } else {
        toast.info('没有需要重新生成的语音（只有修改过并保存的讲稿才会重新生成）');
      }
    } catch (e: unknown) {
      toast.error('生成语音失败: ' + getErrorMessage(e, '未知错误'));
    } finally {
      setGeneratingAudio(false);
    }
  };

  const regenerateScene = async (idx: number) => {
    if (dirty) {
      toast.error('请先保存大纲修改');
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlineIndex: idx }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成失败' }));
        throw new Error(err.error || '生成失败');
      }
      toast.success(`章节"${outlines[idx]?.title}"已重新生成`);
      // Refresh scenes
      const scenesRes = await fetch(`/api/db/scene?stageId=${encodeURIComponent(courseId)}`);
      if (scenesRes.ok) {
        const scj = await scenesRes.json();
        const data = scj.data || scj;
        setScenes(Array.isArray(data) ? data.sort((a: Scene, b: Scene) => a.order - b.order) : []);
      }
      setSceneDirty(false);
      setOriginalSpeechTexts({});
      setDeletedSpeechAudioIds({});
      setDeletedSlideTextTemplates({});
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, '生成失败'));
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const current = outlines[selectedIdx];
  const matchedScene = scenes.find(s => s.order === current?.order);
  const typeInfo = SCENE_TYPE_LABELS[current?.type || 'slide'] || SCENE_TYPE_LABELS.slide;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/courses"
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {stage?.name || '课程详情'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">ID: {courseId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/classroom/${courseId}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            预览课堂
          </Link>
          <button
            onClick={handleSaveAll}
            disabled={(saving || savingScene) || (!dirty && modifiedSceneIds.size === 0)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {(saving || savingScene) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存全部修改
          </button>
        </div>
      </div>

      {outlines.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-slate-500">
          该课程尚未生成大纲。请先通过「生成课程」创建课程内容。
        </div>
      ) : (
        <div className="flex gap-4 min-h-[600px]">
          {/* Left: outline list */}
          <div className="w-64 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                章节列表 ({outlines.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[560px]">
              {outlines.map((o, idx) => {
                const t = SCENE_TYPE_LABELS[o.type] || SCENE_TYPE_LABELS.slide;
                const hasScene = scenes.some(s => s.order === o.order);
                return (
                  <div
                    key={o.id || idx}
                    className={`group relative px-4 py-3 transition-colors cursor-pointer ${selectedIdx === idx
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
                      }`}
                    onClick={() => setSelectedIdx(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.emoji}</span>
                      <span className={`text-sm font-medium truncate flex-1 ${selectedIdx === idx ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'
                        }`}>
                        {o.title || `第${idx + 1}章`}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOutline(idx); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1"
                        title="删除章节"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{t.label}</span>
                      {hasScene && <span className="text-[10px] text-green-500">✓ 已生成</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-y-auto">
            {current ? (
              <div className="p-6 space-y-5">
                {/* Type badge + title */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{typeInfo.emoji}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {typeInfo.label}
                  </span>
                  <span className="text-xs text-slate-400">#{selectedIdx + 1}/{outlines.length}</span>
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">标题</label>
                  <input
                    value={current.title}
                    onChange={e => updateOutlineField(selectedIdx, 'title', e.target.value)}
                    className="w-full text-lg font-bold bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 outline-none pb-1 text-slate-800 dark:text-slate-200"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">描述</label>
                  <textarea
                    value={current.description || ''}
                    onChange={e => updateOutlineField(selectedIdx, 'description', e.target.value)}
                    rows={3}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-300 resize-none"
                  />
                </div>

                {/* Key Points */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      核心知识点
                    </label>
                    <button
                      onClick={() => addKeyPoint(selectedIdx)}
                      className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> 添加
                    </button>
                  </div>
                  {(current.keyPoints || []).map((kp, kpIdx) => (
                    <div key={kpIdx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-5 shrink-0 text-right">{kpIdx + 1}.</span>
                      <input
                        value={kp}
                        onChange={e => updateKeyPoint(selectedIdx, kpIdx, e.target.value)}
                        className="flex-1 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-300"
                      />
                      <button
                        onClick={() => removeKeyPoint(selectedIdx, kpIdx)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Teaching Objective */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">教学目标</label>
                  <input
                    value={current.teachingObjective || ''}
                    onChange={e => updateOutlineField(selectedIdx, 'teachingObjective', e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-300"
                    placeholder="可选"
                  />
                </div>

                {/* Generated content preview (read-only) */}
                {matchedScene && (() => {
                  const content = matchedScene.content as EditableContent;
                  const actions = getEditableActions(matchedScene.actions);
                  const speeches = actions.filter((a) => a.type === 'speech');
                  const slideTexts: {
                    text: string;
                    elIdx: number;
                    left: number;
                    top: number;
                    width: number;
                    height: number;
                    rotate: number;
                    fontSize: number;
                    fontWeight?: string;
                    textAlign?: string;
                    color?: string;
                    fontFamily?: string;
                  }[] = [];
                  const slideImages: { src: string; elIdx: number; left: number; top: number; width: number; height: number }[] = [];
                  const isSlideContent = content?.type === 'slide';
                  const slide = isSlideContent && content.canvas ? (content.canvas as unknown as Slide) : null;
                  const previewSlide = slide
                    ? {
                        ...slide,
                        elements: slide.elements.map((el) =>
                          el.type === 'text' ? { ...el, content: '' } : el,
                        ),
                      }
                    : null;
                  const previewViewportSize = slide?.viewportSize ?? 1000;
                  const previewViewportRatio = slide?.viewportRatio ?? 0.5625;
                  const previewWidth = Math.min(PPT_PREVIEW_WIDTH, previewViewportSize);
                  const previewScale = previewWidth / previewViewportSize;
                  if (content?.type === 'slide' && content?.canvas?.elements) {
                    content.canvas.elements.forEach((el, i) => {
                      if (el.type === 'text') {
                        const raw = typeof el.content === 'string' ? el.content : '';
                        slideTexts.push({
                          text: stripHtmlTags(raw),
                          elIdx: i,
                          left: el.left ?? 0,
                          top: el.top ?? 0,
                          width: el.width ?? 0,
                          height: el.height ?? 0,
                          rotate: el.rotate ?? 0,
                          fontSize: getInlineFontSize(raw) ?? 18,
                          fontWeight: getInlineStyleValue(raw, 'font-weight') || undefined,
                          textAlign: getInlineStyleValue(raw, 'text-align') || undefined,
                          color: getInlineStyleValue(raw, 'color') || el.defaultColor,
                          fontFamily: el.defaultFontName,
                        });
                      } else if (el.type === 'image' && typeof el.src === 'string' && el.src) {
                        slideImages.push({
                          src: el.src,
                          elIdx: i,
                          left: el.left ?? 0,
                          top: el.top ?? 0,
                          width: el.width ?? 0,
                          height: el.height ?? 0,
                        });
                      }
                    });
                  }
                  const quizQuestions: string[] = [];
                  if (content?.type === 'quiz' && Array.isArray(content?.questions)) {
                    content.questions.forEach((q) => {
                      if (q.question) quizQuestions.push(q.question);
                    });
                  }

                  const ACTION_LABELS: Record<string, string> = {
                    speech: '🎤 讲稿',
                    spotlight: '🔦 聚光灯',
                    laser: '🔴 激光笔',
                    play_video: '▶️ 播放视频',
                    wb_open: '📋 打开白板',
                    wb_close: '✖️ 关闭白板',
                    wb_draw_text: '📝 白板板书',
                    wb_draw_shape: '⭕ 白板画图',
                    discussion: '💬 师生讨论',
                  };

                  return (
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4 space-y-4">
                      {/* Slide/Quiz content */}
                      {isSlideContent && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              📋 幻灯片内容（文字 {slideTexts.length} 行 · 图片 {slideImages.length} 张）
                            </label>
                            <button
                              onClick={() => addSlideText(matchedScene.id)}
                              className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> 添加
                            </button>
                          </div>
                          {previewSlide && (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                              <div
                                className="relative mx-auto"
                                style={{
                                  width: `${previewWidth}px`,
                                  height: `${previewWidth * previewViewportRatio}px`,
                                }}
                              >
                                <ThumbnailSlide
                                  slide={previewSlide}
                                  size={previewWidth}
                                  viewportSize={previewViewportSize}
                                  viewportRatio={previewViewportRatio}
                                />
                                {slideTexts.map((item, i) => (
                                  <div
                                    key={`text-overlay-${item.elIdx}`}
                                    className="group absolute"
                                    style={{
                                      left: `${item.left * previewScale}px`,
                                      top: `${item.top * previewScale}px`,
                                      width: `${Math.max(44, item.width * previewScale)}px`,
                                      height: `${Math.max(28, item.height * previewScale)}px`,
                                      transform: item.rotate ? `rotate(${item.rotate}deg)` : undefined,
                                    }}
                                  >
                                    <textarea
                                      value={item.text}
                                      onChange={(e) => updateSlideText(matchedScene.id, item.elIdx, e.target.value)}
                                      title={`直接编辑文字 ${i + 1}`}
                                      className="h-full w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 leading-snug outline-none transition-colors hover:border-blue-400/70 hover:bg-white/70 focus:border-blue-500 focus:bg-white/95 focus:ring-2 focus:ring-blue-500/30 dark:hover:bg-slate-950/70 dark:focus:bg-slate-950/95"
                                      style={{
                                        fontSize: `${Math.max(10, item.fontSize * previewScale)}px`,
                                        fontWeight: item.fontWeight,
                                        textAlign: item.textAlign as CSSProperties['textAlign'],
                                        color: item.color,
                                        fontFamily: item.fontFamily,
                                        lineHeight: 1.5,
                                        padding: `${10 * previewScale}px`,
                                        overflow: 'hidden',
                                      }}
                                    />
                                    <button
                                      onClick={() => deleteSlideElement(matchedScene.id, item.elIdx)}
                                      className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-100 hover:bg-red-50 group-hover:flex dark:bg-slate-900 dark:ring-red-900/50 dark:hover:bg-slate-800"
                                      title={`删除文字 ${i + 1}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                {slideImages.map((item, i) => (
                                  <div
                                    key={`image-overlay-${item.elIdx}`}
                                    className="absolute rounded border border-blue-400/70 bg-blue-500/10"
                                    style={{
                                      left: `${item.left * previewScale}px`,
                                      top: `${item.top * previewScale}px`,
                                      width: `${Math.max(40, item.width * previewScale)}px`,
                                      height: `${Math.max(32, item.height * previewScale)}px`,
                                    }}
                                  >
                                    <div className="absolute right-1 top-1 flex gap-1">
                                      <label
                                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-white/95 text-blue-600 shadow-sm hover:bg-blue-50 dark:bg-slate-900/95 dark:text-blue-400 dark:hover:bg-slate-800"
                                        title={`更换图片 ${i + 1}`}
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.currentTarget.files?.[0];
                                            void replaceSlideImage(matchedScene.id, item.elIdx, file);
                                            e.currentTarget.value = '';
                                          }}
                                        />
                                      </label>
                                      <button
                                        onClick={() => deleteSlideElement(matchedScene.id, item.elIdx)}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded bg-white/95 text-red-500 shadow-sm hover:bg-red-50 dark:bg-slate-900/95 dark:hover:bg-slate-800"
                                        title={`删除图片 ${i + 1}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {slideTexts.length > 0 ? (
                              slideTexts.map((item, i) => (
                                <div key={item.elIdx} className="flex gap-2 items-start">
                                  <span className="text-xs text-slate-400 mt-2 shrink-0 w-5 text-right">{i + 1}.</span>
                                  <textarea
                                    value={item.text}
                                    onChange={e => matchedScene && updateSlideText(matchedScene.id, item.elIdx, e.target.value)}
                                    rows={Math.max(1, Math.ceil(item.text.length / 50))}
                                    className={`flex-1 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-300 resize-none leading-relaxed ${i === 0 ? 'font-semibold' : ''}`}
                                  />
                                  <button
                                    onClick={() => deleteSlideElement(matchedScene.id, item.elIdx)}
                                    className="mt-1.5 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="删除此行"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded px-3 py-3">
                                暂无幻灯片文字，可点击添加新行。
                              </div>
                            )}
                          </div>
                          {slideImages.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                图片
                              </label>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {slideImages.map((item, i) => (
                                  <div
                                    key={item.elIdx}
                                    className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50"
                                  >
                                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                      <img
                                        src={item.src}
                                        alt={`幻灯片图片 ${i + 1}`}
                                        className="h-full w-full object-contain"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                          图片 {i + 1}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <label
                                            className="cursor-pointer rounded p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                                            title="更换此图片"
                                          >
                                            <Upload className="w-3.5 h-3.5" />
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              onChange={(e) => {
                                                const file = e.currentTarget.files?.[0];
                                                void replaceSlideImage(matchedScene.id, item.elIdx, file);
                                                e.currentTarget.value = '';
                                              }}
                                            />
                                          </label>
                                          <button
                                            onClick={() => deleteSlideElement(matchedScene.id, item.elIdx)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            title="删除此图片"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="mt-1 line-clamp-2 break-all text-[11px] text-slate-400">
                                        {item.src}
                                      </div>
                                      {item.width && item.height ? (
                                        <div className="mt-1 text-[11px] text-slate-400">
                                          {Math.round(item.width)} × {Math.round(item.height)}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {content?.type === 'quiz' && Array.isArray(content.questions) && content.questions.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              ❓ 测验题目（{content.questions.length} 道）
                            </label>
                            <button
                              onClick={() => matchedScene && deleteQuizScene(matchedScene.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              删除测验
                            </button>
                          </div>
                          {content.questions.map((q, qIdx) => (
                            <QuizQuestionEditor
                              key={q.id || qIdx}
                              question={q}
                              index={qIdx}
                              onChange={(field: string, value: unknown) =>
                                matchedScene && updateQuizQuestion(matchedScene.id, qIdx, field, value)
                              }
                              onDelete={() => matchedScene && deleteQuizQuestion(matchedScene.id, qIdx)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Speech scripts (editable) */}
                      {matchedScene && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              🎤 讲稿内容（{speeches.length} 段）
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => addSpeechText(matchedScene.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                              >
                                <Plus className="w-3 h-3" />
                                添加
                              </button>
                              {matchedScene ? (
                                <button
                                  onClick={() => generateSceneAudio(matchedScene)}
                                  disabled={generatingAudio || modifiedSceneIds.has(matchedScene.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                                  title={modifiedSceneIds.has(matchedScene.id) ? "请先点击右上角保存修改后再生成语音" : ""}
                                >
                                  {generatingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                  生成最新语音
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {speeches.length > 0 ? (
                              speeches.map((s, i) => {
                                const actionIdx = actions.indexOf(s);
                                return (
                                  <div key={getSpeechActionKey(s, actionIdx)} className="flex gap-2 items-start">
                                    <span className="text-xs text-slate-400 mt-2 shrink-0 w-5 text-right">{i + 1}.</span>
                                    <textarea
                                      value={s.text || ''}
                                      onChange={e => matchedScene && updateSpeechText(matchedScene.id, actionIdx, e.target.value)}
                                      rows={Math.max(2, Math.ceil((s.text || '').length / 50))}
                                      className="flex-1 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 dark:text-slate-300 resize-none leading-relaxed"
                                    />
                                    <button
                                      onClick={() => deleteSpeechText(matchedScene.id, actionIdx)}
                                      className="mt-1.5 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                      title="删除此段讲稿"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded px-3 py-3">
                                暂无讲稿，可点击添加新段落。
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action sequence preview */}
                      {actions.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            🎬 课堂动作执行顺序（共 {actions.length} 个动作）
                          </label>
                          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 space-y-2 max-h-[250px] overflow-y-auto">
                            {actions.map((a, i) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-slate-400 shrink-0 w-6 text-right">{i + 1}.</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 w-24 shrink-0">
                                  {ACTION_LABELS[a.type || ''] || a.type || '未知动作'}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400 truncate">
                                  {a.type === 'speech' ? a.text : 
                                   a.type === 'spotlight' ? `高亮元素 ${a.elementId}` : 
                                   a.type === 'wb_draw_text' ? `板书: ${a.text}` : 
                                   a.type === 'discussion' ? `讨论: ${a.topic}` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Scene status */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500">幻灯片状态：</span>
                      {matchedScene ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium ml-1">✓ 已生成（{(matchedScene.actions as unknown[])?.length || 0} 个动作）</span>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium ml-1">⚠ 未生成</span>
                      )}
                    </div>
                    <button
                      onClick={() => regenerateScene(selectedIdx)}
                      disabled={regenerating || dirty}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                    >
                      {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      重新生成本章节
                    </button>
                  </div>
                  {dirty && (
                    <p className="text-xs text-amber-500 mt-2">⚠ 大纲有未保存的修改，请先保存后再重新生成</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">请选择左侧章节进行编辑</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
