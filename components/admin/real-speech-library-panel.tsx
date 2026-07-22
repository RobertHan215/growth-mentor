'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileJson,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CorpusListItem {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  count: number;
  createdAt: string;
  _count: {
    turns: number;
    samples: number;
  };
}

interface SpeechTurn {
  id: string;
  order: number;
  speaker: 'customer' | 'agent' | string;
  role: 'customer' | 'agent' | string;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

interface SpeechSample {
  id: string;
  collectorPrompt: string;
  customerLine: string;
  sanitizedCustomerLine: string;
  triggerAction: string;
  customerIntent: string;
  emotion: string;
  strategy: string;
  pressureLevel: string;
  dialogueStage: string;
  qualityScore: number;
  enabled: boolean;
  templateBindings: Array<{
    template: {
      id: string;
      name: string;
      personalityType: string | null;
    };
  }>;
}

interface CorpusDetail extends CorpusListItem {
  fullText: string | null;
  dialogueText: string | null;
  turns: SpeechTurn[];
  samples: SpeechSample[];
}

interface CharacterTemplate {
  id: string;
  name: string;
  personalityType?: string | null;
}

function formatTime(seconds: number | null): string {
  if (typeof seconds !== 'number') return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}

function displayStatus(status: string): string {
  if (status === 'processed') return '已抽取';
  if (status === 'speaker_confirmed') return '已确认身份';
  return '待确认身份';
}

function normalizeRole(value: unknown): 'customer' | 'agent' {
  return value === 'agent' ? 'agent' : 'customer';
}

function buildRoleDraft(turns: SpeechTurn[]): Record<string, 'customer' | 'agent'> {
  return Object.fromEntries(
    turns.map((turn) => [turn.id, normalizeRole(turn.role)]),
  );
}

export function RealSpeechLibraryPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [corpora, setCorpora] = useState<CorpusListItem[]>([]);
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CorpusDetail | null>(null);
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [binding, setBinding] = useState(false);
  const [savingSpeakerRoles, setSavingSpeakerRoles] = useState(false);
  const [speakerConfirmOpen, setSpeakerConfirmOpen] = useState(false);
  const [roleDraftByTurnId, setRoleDraftByTurnId] = useState<Record<string, 'customer' | 'agent'>>(
    {},
  );
  const [textDraftByTurnId, setTextDraftByTurnId] = useState<Record<string, string>>({});
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [editingSampleText, setEditingSampleText] = useState<string>('');

  const fetchCorpora = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/real-speech-corpus');
      if (!res.ok) throw new Error('加载真实话术素材失败');
      const data = (await res.json()) as { corpora?: CorpusListItem[] };
      setCorpora(Array.isArray(data.corpora) ? data.corpora : []);
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/character-templates');
      if (!res.ok) throw new Error('加载角色模板失败');
      const data = (await res.json()) as CharacterTemplate[];
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(readErrorMessage(error));
    }
  }, []);

  const fetchDetail = useCallback(async (corpusId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/real-speech-corpus/${corpusId}`);
      if (!res.ok) throw new Error('加载素材详情失败');
      const data = (await res.json()) as { corpus?: CorpusDetail };
      const corpus = data.corpus || null;
      setDetail(corpus);
      setRoleDraftByTurnId(corpus ? buildRoleDraft(corpus.turns) : {});
      setTextDraftByTurnId(
        corpus ? Object.fromEntries(corpus.turns.map((t) => [t.id, t.text])) : {},
      );

      // 回显角色绑定
      if (corpus && corpus.samples && corpus.samples.length > 0) {
        const firstBound = corpus.samples.find(
          (s) => s.templateBindings && s.templateBindings.length > 0,
        );
        if (firstBound) {
          setSelectedTemplateId(firstBound.templateBindings[0].template.id);
        } else {
          setSelectedTemplateId(null);
        }
      } else {
        setSelectedTemplateId(null);
      }
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      if (!options?.silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCorpora();
    fetchTemplates();
  }, [fetchCorpora, fetchTemplates]);

  useEffect(() => {
    if (selectedCorpusId) {
      fetchDetail(selectedCorpusId);
    } else {
      setDetail(null);
      setSelectedTemplateId(null);
    }
  }, [fetchDetail, selectedCorpusId]);

  const handleImportFile = async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const res = await fetch('/api/admin/real-speech-corpus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name.replace(/\.json$/i, ''),
          payload,
        }),
      });
      const data = (await res.json()) as { corpus?: CorpusListItem; error?: string };
      if (!res.ok) throw new Error(data.error || '导入 ASR JSON 失败');

      toast.success('ASR JSON 已导入');
      await fetchCorpora();
      if (data.corpus?.id) {
        setSelectedCorpusId(data.corpus.id);
        setSpeakerConfirmOpen(true);
      }
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    if (!detail) return;
    if (detail.status === 'imported') {
      toast.error('请先确认客户和催收员身份');
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch(`/api/admin/real-speech-corpus/${detail.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });
      const data = (await res.json()) as { extracted?: number; error?: string };
      if (!res.ok) throw new Error(data.error || '抽取客户话术失败');
      toast.success(`已抽取 ${data.extracted || 0} 条客户话术样本`);
      await Promise.all([fetchCorpora(), fetchDetail(detail.id)]);
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      setExtracting(false);
    }
  };

  const handleUseCurrentRoles = () => {
    if (!detail) return;
    setRoleDraftByTurnId(buildRoleDraft(detail.turns));
    setTextDraftByTurnId(Object.fromEntries(detail.turns.map((t) => [t.id, t.text])));
  };

  const handleCloseSpeakerConfirm = () => {
    if (detail) {
      setRoleDraftByTurnId(buildRoleDraft(detail.turns));
      setTextDraftByTurnId(Object.fromEntries(detail.turns.map((t) => [t.id, t.text])));
    }
    setSpeakerConfirmOpen(false);
  };

  const handleSwapRoles = () => {
    if (!detail) return;
    setRoleDraftByTurnId((prev) =>
      Object.fromEntries(
        detail.turns.map((turn) => {
          const current = prev[turn.id] || normalizeRole(turn.role);
          return [turn.id, current === 'customer' ? 'agent' : 'customer'];
        }),
      ),
    );
  };

  const handleSaveSpeakerRoles = async () => {
    if (!detail) return;
    setSavingSpeakerRoles(true);
    try {
      const res = await fetch(`/api/admin/real-speech-corpus/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rolesByTurnId: roleDraftByTurnId,
          textsByTurnId: textDraftByTurnId
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || '保存转写内容与身份确认失败');
      toast.success('转写内容与说话人身份已保存，旧样本已清空，请重新抽取');
      setSpeakerConfirmOpen(false);
      await Promise.all([fetchCorpora(), fetchDetail(detail.id)]);
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      setSavingSpeakerRoles(false);
    }
  };

  const handleSaveCorpusBinding = async () => {
    if (!detail) return;
    if (detail.samples.length === 0) {
      toast.error('当前素材没有可绑定的客户话术样本');
      return;
    }

    setBinding(true);
    try {
      const res = await fetch('/api/admin/real-speech-samples/bind', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleIds: detail.samples.map((sample) => sample.id),
          templateId: selectedTemplateId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || '绑定角色模板失败');
      toast.success(selectedTemplateId ? '角色绑定已保存' : '角色绑定已清空');
      await fetchDetail(detail.id, { silent: true });
    } catch (error) {
      toast.error(readErrorMessage(error));
    } finally {
      setBinding(false);
    }
  };

  const handleToggleSample = async (sample: SpeechSample) => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/admin/real-speech-samples/${sample.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !sample.enabled }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || '更新样本失败');
      await fetchDetail(detail.id);
    } catch (error) {
      toast.error(readErrorMessage(error));
    }
  };

  const handleUpdateSampleText = async (sample: SpeechSample) => {
    if (!detail) return;
    if (!editingSampleText.trim()) {
      toast.error('样本话术文字不能为空');
      return;
    }
    try {
      const res = await fetch(`/api/admin/real-speech-samples/${sample.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerLine: editingSampleText }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || '更新样本失败');
      toast.success('样本话术已更新');
      setEditingSampleId(null);
      await fetchDetail(detail.id);
    } catch (error) {
      toast.error(readErrorMessage(error));
    }
  };

  const handleDeleteCorpus = async (corpus: Pick<CorpusListItem, 'id' | 'name'>) => {
    if (
      !confirm(
        `确定要删除「${corpus.name}」吗？该操作会同时删除转写内容、客户话术样本和角色绑定。`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/real-speech-corpus/${corpus.id}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || '删除真实话术素材失败');

      toast.success('素材已删除');
      if (selectedCorpusId === corpus.id) {
        setSelectedCorpusId(null);
        setDetail(null);
        setSpeakerConfirmOpen(false);
      }
      await fetchCorpora();
    } catch (error) {
      toast.error(readErrorMessage(error));
    }
  };

  const stat = useMemo(() => {
    const corpusCount = corpora.length;
    const turnCount = corpora.reduce((sum, corpus) => sum + corpus._count.turns, 0);
    const sampleCount = corpora.reduce((sum, corpus) => sum + corpus._count.samples, 0);
    const processedCount = corpora.filter((corpus) => corpus.status === 'processed').length;
    return { corpusCount, turnCount, sampleCount, processedCount };
  }, [corpora]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            真实话术库
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            导入 ASR JSON，抽取真实客户回应，并绑定到一对一客户角色。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            导入 ASR JSON
          </button>
          <button
            type="button"
            onClick={fetchCorpora}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['素材数', stat.corpusCount],
          ['已处理', stat.processedCount],
          ['对话轮次', stat.turnCount],
          ['客户样本', stat.sampleCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">素材列表</h3>
          </div>
          <div className="max-h-[720px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : corpora.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-400">
                暂无素材，请先导入 ASR JSON
              </div>
            ) : (
              corpora.map((corpus) => (
                <div
                  key={corpus.id}
                  className={cn(
                    'mb-2 flex items-start gap-2 rounded-lg border p-3 transition-colors',
                    selectedCorpusId === corpus.id
                      ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20'
                      : 'border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCorpusId(corpus.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {corpus.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {corpus._count.turns} 轮 · {corpus._count.samples} 样本 ·{' '}
                        {displayStatus(corpus.status)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {new Date(corpus.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCorpus(corpus)}
                    className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                    title="删除素材"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="min-h-[720px] rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          {!detail && !detailLoading ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-slate-400">
              <FileJson className="mb-3 h-8 w-8 opacity-50" />
              <p className="text-sm">选择一个素材查看转写和客户样本</p>
            </div>
          ) : detailLoading ? (
            <div className="flex h-full min-h-[420px] items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {detail.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {detail.turns.length} 轮转写 · {detail.samples.length} 条客户样本 ·{' '}
                    {displayStatus(detail.status)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSpeakerConfirmOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/20"
                  >
                    确认身份
                  </button>
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={extracting || detail.status === 'imported'}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    title={detail.status === 'imported' ? '请先确认客户和催收员身份' : undefined}
                  >
                    {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    AI 规则抽取客户话术
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCorpus(detail)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除素材
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      关联角色模板
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      选择关联的角色模板，该话术素材的所有样本将与此角色绑定。
                    </p>
                  </div>
                  <select
                    value={selectedTemplateId || ''}
                    onChange={(event) => setSelectedTemplateId(event.target.value || null)}
                    className="min-w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="">未绑定</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                        {template.personalityType ? ` · ${template.personalityType}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveCorpusBinding}
                    disabled={binding || detail.samples.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {binding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {selectedTemplateId ? '保存角色绑定' : '清空角色绑定'}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      ASR 转写
                    </h4>
                  </div>
                  <div className="max-h-[520px] space-y-2 overflow-y-auto p-4">
                    {detail.turns.map((turn) => (
                      <div
                        key={turn.id}
                        className={cn(
                          'rounded-lg p-3 text-sm',
                          normalizeRole(roleDraftByTurnId[turn.id] || turn.role) === 'customer'
                            ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100'
                            : 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] opacity-70">
                          <div className="flex items-center gap-2">
                            <span>身份</span>
                            <span className="rounded border border-white/50 bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                              {normalizeRole(roleDraftByTurnId[turn.id] || turn.role) === 'customer'
                                ? '客户'
                                : '催收员'}
                            </span>
                          </div>
                          <span>{formatTime(turn.startTime)}</span>
                        </div>
                        <p className="leading-relaxed">{turn.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      客户话术样本
                    </h4>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto">
                    {detail.samples.length === 0 ? (
                      <div className="px-4 py-12 text-center text-sm text-slate-400">
                        尚未抽取客户话术样本
                      </div>
                    ) : (
                      detail.samples.map((sample) => (
                        <div
                          key={sample.id}
                          className="border-b border-slate-100 p-4 last:border-b-0 dark:border-slate-800"
                        >
                          <div className="mb-2 flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-400">
                                催收员：{sample.collectorPrompt || '客户主动开口'}
                              </p>
                              {editingSampleId === sample.id ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editingSampleText}
                                    onChange={(event) => setEditingSampleText(event.target.value)}
                                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateSampleText(sample)}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                                  >
                                    保存
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSampleId(null)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-800"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-1 flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                                    客户：{sample.customerLine || sample.sanitizedCustomerLine}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSampleId(sample.id);
                                      setEditingSampleText(sample.customerLine || sample.sanitizedCustomerLine);
                                    }}
                                    className="shrink-0 text-xs text-slate-400 hover:text-amber-600"
                                  >
                                    编辑
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleSample(sample)}
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                                sample.enabled
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-400 dark:bg-slate-900',
                              )}
                            >
                              {sample.enabled ? '启用' : '停用'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              sample.triggerAction,
                              sample.customerIntent,
                              sample.strategy,
                              sample.emotion,
                              `${sample.qualityScore}分`,
                            ].map((label) => (
                              <span
                                key={label}
                                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {speakerConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  确认说话人身份
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  导入后请先确认每一轮是客户还是催收员。确认错误会影响后续客户话术抽取。
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSpeakerConfirm}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900"
                title="稍后确认"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!detail || detailLoading ? (
              <div className="flex min-h-[360px] items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">
                    {detail.name} · {detail.turns.length} 轮转写
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentRoles}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      按当前身份
                    </button>
                    <button
                      type="button"
                      onClick={handleSwapRoles}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                      一键互换
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-5">
                  {detail.turns.map((turn) => {
                    const draftRole = normalizeRole(roleDraftByTurnId[turn.id] || turn.role);
                    return (
                      <div
                        key={turn.id}
                        className={cn(
                          'rounded-lg border p-3',
                          draftRole === 'customer'
                            ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
                        )}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>#{turn.order}</span>
                            <span>{formatTime(turn.startTime)}</span>
                            <span>身份</span>
                          </div>
                          <select
                            value={draftRole}
                            onChange={(event) =>
                              setRoleDraftByTurnId((prev) => ({
                                ...prev,
                                [turn.id]: normalizeRole(event.target.value),
                              }))
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          >
                            <option value="customer">客户</option>
                            <option value="agent">催收员</option>
                          </select>
                        </div>
                        <textarea
                          value={textDraftByTurnId[turn.id] ?? turn.text}
                          onChange={(event) =>
                            setTextDraftByTurnId((prev) => ({
                              ...prev,
                              [turn.id]: event.target.value,
                            }))
                          }
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleCloseSpeakerConfirm}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
                  >
                    稍后确认
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSpeakerRoles}
                    disabled={savingSpeakerRoles}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingSpeakerRoles ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    保存身份确认
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
