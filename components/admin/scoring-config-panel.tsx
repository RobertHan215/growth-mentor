'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type {
  DetailCriterion,
  OneOnOneScoringCriteria,
  PrimaryCriterion,
  ScoringMode,
  SecondaryCriterion,
} from '@/lib/types/one-on-one-scoring';
import {
  normalizeScoringCriteria,
  validateScoringCriteria,
} from '@/lib/training/one-on-one-scoring-config';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface ScoringConfigRecord {
  id: string;
  tagId: string;
  name: string;
  description: string | null;
  criteria: OneOnOneScoringCriteria;
  enabled: boolean;
}

interface ScoringConfigForm {
  name: string;
  description: string;
  enabled: boolean;
  criteria: OneOnOneScoringCriteria;
}

function createDetail(): DetailCriterion {
  return {
    id: nanoid(8),
    name: '指标明细',
    weight: 100,
    description: '说明该明细的评分标准。',
  };
}

function createSecondary(): SecondaryCriterion {
  return {
    id: nanoid(8),
    name: '二级指标',
    weight: 100,
    details: [createDetail()],
  };
}

function createPrimary(): PrimaryCriterion {
  return {
    id: nanoid(8),
    name: '一级指标',
    scoringMode: 'bonus',
    weight: 100,
    children: [createSecondary()],
  };
}

function createDefaultCriteria(): OneOnOneScoringCriteria {
  return {
    version: 1,
    scoringMode: 'bonus',
    primary: [createPrimary()],
  };
}

function createDefaultForm(tagName?: string): ScoringConfigForm {
  return {
    name: tagName ? `${tagName}评分配置` : '评分配置',
    description: '',
    enabled: true,
    criteria: createDefaultCriteria(),
  };
}

function parseWeight(value: string): number {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败';
}

function validateWeight(value: number, label: string, errors: string[]) {
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${label} 的权重必须为正整数`);
  }
}

function modeLabel(mode: ScoringMode): string {
  return mode === 'deduction' ? '扣分制' : '加分制';
}

function weightLabelFor(mode: ScoringMode): string {
  return mode === 'deduction' ? '最高扣分' : '最高加分';
}

function validateRawCriteria(criteria: OneOnOneScoringCriteria): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (criteria.primary.length === 0) {
    errors.push('请至少添加一个一级指标');
  }

  criteria.primary.forEach((primary, primaryIndex) => {
    const primaryLabel = `一级指标 ${primaryIndex + 1}`;
    if (!primary.name.trim()) {
      errors.push(`${primaryLabel} 不能为空`);
    }
    validateWeight(primary.weight, primary.name.trim() || primaryLabel, errors);

    if (primary.children.length === 0) {
      errors.push(`${primary.name.trim() || primaryLabel} 请至少添加一个二级指标`);
    }

    primary.children.forEach((secondary, secondaryIndex) => {
      const secondaryLabel = `${primary.name.trim() || primaryLabel} 的二级指标 ${secondaryIndex + 1}`;
      if (!secondary.name.trim()) {
        errors.push(`${secondaryLabel} 不能为空`);
      }
      validateWeight(secondary.weight, secondary.name.trim() || secondaryLabel, errors);

      if (secondary.details.length === 0) {
        errors.push(`${secondary.name.trim() || secondaryLabel} 请至少添加一个指标明细`);
      }

      secondary.details.forEach((detail, detailIndex) => {
        const detailLabel = `${secondary.name.trim() || secondaryLabel} 的指标明细 ${detailIndex + 1}`;
        if (!detail.name.trim()) {
          errors.push(`${detailLabel} 不能为空`);
        }
        validateWeight(detail.weight, detail.name.trim() || detailLabel, errors);
      });
    });
  });

  if (errors.length === 0) {
    errors.push(...validateScoringCriteria(criteria).errors);
  }

  return { valid: errors.length === 0, errors };
}

export function ScoringConfigPanel() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [configId, setConfigId] = useState<string | null>(null);
  const [form, setForm] = useState<ScoringConfigForm>(() => createDefaultForm());
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [parsingAi, setParsingAi] = useState(false);

  const handleAiParse = async () => {
    if (!aiInputText.trim()) {
      toast.error('请输入需要分析的评分标准文本');
      return;
    }

    setParsingAi(true);
    try {
      const res = await fetch('/api/admin/one-on-one-scoring-configs/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiInputText }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'AI 提取失败');
      }

      const data = await res.json();
      if (data?.criteria) {
        setForm((prev) => ({
          ...prev,
          criteria: normalizeScoringCriteria({
            ...data.criteria,
            scoringMode: prev.criteria.scoringMode,
          }),
        }));
        toast.success('✨ 指标提取成功，已填充至表单中！请仔细检查并微调权重。');
        setIsAiModalOpen(false);
        setAiInputText('');
      } else {
        throw new Error('未获取到有效的解析数据');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 提取失败');
    } finally {
      setParsingAi(false);
    }
  };

  const criteriaValidation = useMemo(
    () => validateRawCriteria(form.criteria),
    [form.criteria],
  );

  const firstError = !form.name.trim()
    ? '请输入评分配置名称'
    : criteriaValidation.errors[0] || '';
  const saveDisabled = saving || loadingConfig || !selectedTagId || Boolean(firstError);

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('加载标签失败');
      const data = await res.json();
      const nextTags = Array.isArray(data) ? data : [];
      setTags(nextTags);
      setSelectedTagId((current) => current || nextTags[0]?.id || '');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setTags([]);
      setSelectedTagId('');
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const fetchConfig = useCallback(async (tagId: string, signal: AbortSignal) => {
    setLoadingConfig(true);
    try {
      const res = await fetch(`/api/admin/one-on-one-scoring-configs?tagId=${encodeURIComponent(tagId)}`, { signal });
      if (!res.ok) throw new Error('加载评分配置失败');
      const data = (await res.json()) as ScoringConfigRecord | null;
      if (signal.aborted) return;

      if (data) {
        setConfigId(data.id);
        setForm({
          name: data.name,
          description: data.description || '',
          enabled: data.enabled,
          criteria: normalizeScoringCriteria(data.criteria),
        });
        return;
      }

      const tag = tags.find((item) => item.id === tagId);
      setConfigId(null);
      setForm(createDefaultForm(tag?.name));
    } catch (error) {
      if (signal.aborted) return;
      toast.error(getErrorMessage(error));
      setConfigId(null);
      const tag = tags.find((item) => item.id === tagId);
      setForm(createDefaultForm(tag?.name));
    } finally {
      if (!signal.aborted) {
        setLoadingConfig(false);
      }
    }
  }, [tags]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    if (!selectedTagId) return;
    const controller = new AbortController();
    fetchConfig(selectedTagId, controller.signal);
    return () => controller.abort();
  }, [fetchConfig, selectedTagId]);

  const updatePrimary = (primaryIndex: number, patch: Partial<PrimaryCriterion>) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex ? { ...primary, ...patch } : primary,
        ),
      },
    }));
  };

  const updateSecondary = (
    primaryIndex: number,
    secondaryIndex: number,
    patch: Partial<SecondaryCriterion>,
  ) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: primary.children.map((secondary, childIndex) =>
                  childIndex === secondaryIndex ? { ...secondary, ...patch } : secondary,
                ),
              }
            : primary,
        ),
      },
    }));
  };

  const updateDetail = (
    primaryIndex: number,
    secondaryIndex: number,
    detailIndex: number,
    patch: Partial<DetailCriterion>,
  ) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: primary.children.map((secondary, childIndex) =>
                  childIndex === secondaryIndex
                    ? {
                        ...secondary,
                        details: secondary.details.map((detail, itemIndex) =>
                          itemIndex === detailIndex ? { ...detail, ...patch } : detail,
                        ),
                      }
                    : secondary,
                ),
              }
            : primary,
        ),
      },
    }));
  };

  const addPrimary = () => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: [
          ...prev.criteria.primary,
          {
            ...createPrimary(),
            scoringMode:
              prev.criteria.primary[prev.criteria.primary.length - 1]?.scoringMode ||
              prev.criteria.scoringMode,
            weight: 1,
            children: [{ ...createSecondary(), weight: 1, details: [{ ...createDetail(), weight: 1 }] }],
          },
        ],
      },
    }));
  };

  const removePrimary = (primaryIndex: number) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.filter((_, index) => index !== primaryIndex),
      },
    }));
  };

  const addSecondary = (primaryIndex: number) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: [
                  ...primary.children,
                  { ...createSecondary(), weight: 1, details: [{ ...createDetail(), weight: 1 }] },
                ],
              }
            : primary,
        ),
      },
    }));
  };

  const removeSecondary = (primaryIndex: number, secondaryIndex: number) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: primary.children.filter((_, childIndex) => childIndex !== secondaryIndex),
              }
            : primary,
        ),
      },
    }));
  };

  const addDetail = (primaryIndex: number, secondaryIndex: number) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: primary.children.map((secondary, childIndex) =>
                  childIndex === secondaryIndex
                    ? { ...secondary, details: [...secondary.details, { ...createDetail(), weight: 1 }] }
                    : secondary,
                ),
              }
            : primary,
        ),
      },
    }));
  };

  const removeDetail = (primaryIndex: number, secondaryIndex: number, detailIndex: number) => {
    setForm((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        primary: prev.criteria.primary.map((primary, index) =>
          index === primaryIndex
            ? {
                ...primary,
                children: primary.children.map((secondary, childIndex) =>
                  childIndex === secondaryIndex
                    ? {
                        ...secondary,
                        details: secondary.details.filter((_, itemIndex) => itemIndex !== detailIndex),
                      }
                    : secondary,
                ),
              }
            : primary,
        ),
      },
    }));
  };

  const handleSave = async () => {
    if (saveDisabled) return;
    setSaving(true);
    try {
      const payload = {
        tagId: selectedTagId,
        name: form.name.trim(),
        description: form.description,
        enabled: form.enabled,
        criteria: normalizeScoringCriteria(form.criteria),
      };
      const res = await fetch(
        configId
          ? `/api/admin/one-on-one-scoring-configs/${configId}`
          : '/api/admin/one-on-one-scoring-configs',
        {
          method: configId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || '保存评分配置失败');
      }

      setConfigId(data.id);
      setForm({
        name: data.name,
        description: data.description || '',
        enabled: data.enabled,
        criteria: normalizeScoringCriteria(data.criteria),
      });
      toast.success(configId ? '已更新评分配置' : '已创建评分配置');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loadingTags) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (tags.length === 0) {
    return <div className="text-center py-12 text-slate-500">暂无标签</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">标签</span>
          <select
            value={selectedTagId}
            onChange={(event) => setSelectedTagId(event.target.value)}
            className="min-w-48 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
            className="w-4 h-4 rounded border-slate-300 text-blue-600"
          />
          启用
        </label>

        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
      </div>

      {loadingConfig ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1">配置名称</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1">描述</span>
              <input
                type="text"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </label>
          </div>

          {firstError && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {firstError}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">评分模式</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              评分模式在一级指标上选择；该一级指标下的二级指标和指标明细自动继承同一模式。加分制按达标项累加得分，扣分制按未达标项从该一级指标满分中扣减。
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">评分指标</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200/50 dark:border-purple-800/30 transition-colors shadow-sm"
                >
                  <span className="animate-pulse">✨</span>
                  AI 快速提取指标
                </button>
                <button
                  type="button"
                  onClick={addPrimary}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  添加一级
                </button>
              </div>
            </div>

            {form.criteria.primary.map((primary, primaryIndex) => {
              const primaryWeightLabel = weightLabelFor(primary.scoringMode);
              return (
              <div key={primary.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_auto] gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1" htmlFor={`primary-name-${primary.id}`}>一级指标</label>
                    <input
                      id={`primary-name-${primary.id}`}
                      type="text"
                      value={primary.name}
                      onChange={(event) => updatePrimary(primaryIndex, { name: event.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1" htmlFor={`primary-mode-${primary.id}`}>评分模式</label>
                    <select
                      id={`primary-mode-${primary.id}`}
                      value={primary.scoringMode}
                      onChange={(event) =>
                        updatePrimary(primaryIndex, {
                          scoringMode: event.target.value === 'deduction' ? 'deduction' : 'bonus',
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {(['bonus', 'deduction'] as const).map((mode) => (
                        <option key={mode} value={mode}>
                          {modeLabel(mode)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1" htmlFor={`primary-weight-${primary.id}`}>{primaryWeightLabel}</label>
                    <input
                      id={`primary-weight-${primary.id}`}
                      type="number"
                      min={0}
                      value={primary.weight}
                      onChange={(event) => updatePrimary(primaryIndex, { weight: parseWeight(event.target.value) })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex items-end gap-1">
                    <button
                      onClick={() => addSecondary(primaryIndex)}
                      aria-label={`为一级指标 ${primary.name || primaryIndex + 1} 添加二级指标`}
                      className="p-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="添加二级"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removePrimary(primaryIndex)}
                      aria-label={`删除一级指标 ${primary.name || primaryIndex + 1}`}
                      className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="删除一级"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pl-0 md:pl-4">
                  {primary.children.map((secondary, secondaryIndex) => (
                    <div key={secondary.id} className="border-l-2 border-slate-200 dark:border-slate-800 pl-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1" htmlFor={`secondary-name-${secondary.id}`}>二级指标</label>
                          <input
                            id={`secondary-name-${secondary.id}`}
                            type="text"
                            value={secondary.name}
                            onChange={(event) =>
                              updateSecondary(primaryIndex, secondaryIndex, { name: event.target.value })
                            }
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1" htmlFor={`secondary-weight-${secondary.id}`}>{primaryWeightLabel}</label>
                          <input
                            id={`secondary-weight-${secondary.id}`}
                            type="number"
                            min={0}
                            value={secondary.weight}
                            onChange={(event) =>
                              updateSecondary(primaryIndex, secondaryIndex, { weight: parseWeight(event.target.value) })
                            }
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <button
                            onClick={() => addDetail(primaryIndex, secondaryIndex)}
                            aria-label={`为二级指标 ${secondary.name || secondaryIndex + 1} 添加指标明细`}
                            className="p-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            title="添加明细"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeSecondary(primaryIndex, secondaryIndex)}
                            aria-label={`删除二级指标 ${secondary.name || secondaryIndex + 1}`}
                            className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="删除二级"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {secondary.details.map((detail, detailIndex) => (
                          <div
                            key={detail.id}
                            className="grid grid-cols-1 md:grid-cols-[1fr_100px_1.4fr_auto] gap-3 items-start"
                          >
                            <div>
                              <label className="block text-xs text-slate-500 mb-1" htmlFor={`detail-name-${detail.id}`}>指标明细</label>
                              <input
                                id={`detail-name-${detail.id}`}
                                type="text"
                                value={detail.name}
                                onChange={(event) =>
                                  updateDetail(primaryIndex, secondaryIndex, detailIndex, { name: event.target.value })
                                }
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1" htmlFor={`detail-weight-${detail.id}`}>{primaryWeightLabel}</label>
                              <input
                                id={`detail-weight-${detail.id}`}
                                type="number"
                                min={0}
                                value={detail.weight}
                                onChange={(event) =>
                                  updateDetail(primaryIndex, secondaryIndex, detailIndex, {
                                    weight: parseWeight(event.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1" htmlFor={`detail-description-${detail.id}`}>描述</label>
                              <input
                                id={`detail-description-${detail.id}`}
                                type="text"
                                value={detail.description}
                                onChange={(event) =>
                                  updateDetail(primaryIndex, secondaryIndex, detailIndex, {
                                    description: event.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div className="pt-5">
                              <button
                                onClick={() => removeDetail(primaryIndex, secondaryIndex, detailIndex)}
                                aria-label={`删除指标明细 ${detail.name || detailIndex + 1}`}
                                className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="删除明细"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
      <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
        <DialogContent className="sm:max-w-[600px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 font-sans">
          <DialogTitle className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>✨</span> AI 快速提取评分指标
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            贴入您的评分文档或文本，AI 将智能提取出一级、二级指标、细则描述及权重，并填充当前表单。本功能严格忠实原文，不会脑补无关的指标。
          </DialogDescription>
          
          <div className="mt-4 space-y-4">
            <textarea
              value={aiInputText}
              onChange={(e) => setAiInputText(e.target.value)}
              placeholder="例如：
第一部分：专业知识考核 (占比50%)
1. 业务合规性（30分）：回答符合公司规范，无违规。
2. 方案准确性（20分）：提供科学合理的产品配置方案。

第二部分：服务态度考核 (占比50%)
1. 沟通亲和力（30分）：态度温和有礼，使用敬语。
2. 问题解答耐心（20分）：面对重复问题能耐心解答。"
              className="w-full h-64 p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-sans resize-none"
              disabled={parsingAi}
            />
            
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                disabled={parsingAi}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-750 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAiParse}
                disabled={parsingAi}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60 rounded-lg transition-colors shadow-sm"
              >
                {parsingAi ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在分析提取...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    开始提取
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
