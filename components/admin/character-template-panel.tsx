'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AiCharacterTemplate,
  CharacterProfile,
  CharacterDimension,
} from '@/lib/types/ai-character-template';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface CharacterTemplateFormData {
  name: string;
  description: string;
  personalityType: string;
  tagIds: string[];
  profile: CharacterProfile;
  dimensions: CharacterDimension[];
}

interface ParsedCharacterTemplateFormData {
  name?: string;
  description?: string;
  personalityType?: string;
  profile?: Partial<CharacterProfile>;
  dimensions?: CharacterDimension[];
  error?: string;
}

const DEFAULT_PROFILE: CharacterProfile = {
  name: '',
  age: undefined,
  gender: '',
  occupation: '',
  monthlyIncome: undefined,
  monthlyPayment: undefined,
  totalInstallments: undefined,
  paidInstallments: undefined,
  customerSituation: '',
  debtAmount: undefined,
  debtDays: undefined,
  debtReason: '',
  familyStatus: '',
  catchphrases: '',
  closingPrompt: '',
};

const DEFAULT_DIMENSIONS: CharacterDimension[] = [
  {
    id: 'triggerReason',
    label: '触发原因',
    description: '本次催收或对练被触发的业务原因',
    content: '',
    order: 1,
    enabled: true,
  },
  {
    id: 'communicationBehavior',
    label: '沟通表现',
    description: '客户在沟通中的典型态度、语气和抗拒方式',
    content: '',
    order: 2,
    enabled: true,
  },
  {
    id: 'customerSituation',
    label: '客户情况',
    description: '客户还款合同、月供、总期数、已还期数和当前还款压力',
    content: '',
    order: 3,
    enabled: true,
  },
  {
    id: 'vehicleStatus',
    label: '车辆状态',
    description: '车辆当前使用、停放、权属或处置风险',
    content: '',
    order: 4,
    enabled: true,
  },
  {
    id: 'assetClues',
    label: '资产线索',
    description: '可用于判断客户还款能力或跟进方向的资产信息',
    content: '',
    order: 5,
    enabled: true,
  },
  {
    id: 'collectionStrategy',
    label: '催收策略',
    description: '适合该客户画像的催收推进策略和对练挑战点',
    content: '',
    order: 6,
    enabled: true,
  },
];

const DEFAULT_FORM: CharacterTemplateFormData = {
  name: '',
  description: '',
  personalityType: '',
  tagIds: [],
  profile: { ...DEFAULT_PROFILE },
  dimensions: [...DEFAULT_DIMENSIONS],
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Fall back to plain text below.
  }

  return (await response.text()) || fallback;
}

function mergeParsedProfile(
  current: CharacterProfile,
  parsed?: Partial<CharacterProfile>,
): CharacterProfile {
  if (!parsed) return current;

  const patch: Partial<CharacterProfile> = {};
  Object.entries(parsed).forEach(([key, value]) => {
    if (key === 'ttsConfig' || value === undefined || value === null) return;
    if (typeof value === 'string' && !value.trim()) return;
    (patch as Record<string, unknown>)[key] = value;
  });

  return {
    ...current,
    ...patch,
    ttsConfig: current.ttsConfig,
  };
}

export function CharacterTemplatePanel() {
  const [templates, setTemplates] = useState<AiCharacterTemplate[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterTagId, setFilterTagId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CharacterTemplateFormData>({ ...DEFAULT_FORM });
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [isTemplateImportModalOpen, setIsTemplateImportModalOpen] = useState(false);
  const [templateImportText, setTemplateImportText] = useState('');
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [isDimensionAiModalOpen, setIsDimensionAiModalOpen] = useState(false);
  const [dimensionAiInputText, setDimensionAiInputText] = useState('');
  const [extractingDimensions, setExtractingDimensions] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<{ voiceId: string; name?: string; providerId: string }[]>([]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  const fetchVoiceOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/default-provider-config');
      if (res.ok) {
        const data = await res.json();
        setVoiceOptions(data.defaults?.ttsVoicesMap || []);
      }
    } catch (err) {
      console.error('Failed to fetch voice options:', err);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterTagId
        ? `/api/admin/character-templates?tagId=${filterTagId}`
        : '/api/admin/character-templates';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTemplates(data);
    } catch {
      toast.error('加载角色模板失败');
    } finally {
      setLoading(false);
    }
  }, [filterTagId]);

  useEffect(() => {
    fetchTags();
    fetchVoiceOptions();
  }, [fetchTags, fetchVoiceOptions]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData({
      ...DEFAULT_FORM,
      profile: {
        ...DEFAULT_PROFILE,
        ttsConfig: {},
      },
    });
    setDialogOpen(true);
  };

  const openEditDialog = (template: AiCharacterTemplate) => {
    setEditingId(template.id);
    const profile = template.profile ? { ...template.profile } : { ...DEFAULT_PROFILE };
    if (!profile.ttsConfig) {
      profile.ttsConfig = {};
    }
    setFormData({
      name: template.name,
      description: template.description || '',
      personalityType: template.personalityType || '',
      tagIds: template.tagIds || [],
      profile,
      dimensions: template.dimensions?.length > 0 ? template.dimensions : [...DEFAULT_DIMENSIONS],
    });
    setDialogOpen(true);
  };

  const handleDuplicate = async (template: AiCharacterTemplate) => {
    try {
      const res = await fetch('/api/admin/character-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (副本)`,
          description: template.description,
          personalityType: template.personalityType,
          profile: template.profile,
          dimensions: template.dimensions || [],
          tagIds: template.tagIds,
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success('已创建副本');
      fetchTemplates();
    } catch {
      toast.error('创建副本失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个角色模板吗？')) return;
    try {
      const res = await fetch(`/api/admin/character-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('已删除');
      fetchTemplates();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入角色名称');
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/character-templates/${editingId}`
        : '/api/admin/character-templates';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(editingId ? '已更新' : '已创建');
      setDialogOpen(false);
      fetchTemplates();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (patch: Partial<CharacterProfile>) => {
    setFormData((prev) => ({
      ...prev,
      profile: { ...prev.profile, ...patch },
    }));
  };

  const handleGenerateProfile = async () => {
    if (!formData.name) {
      toast.error('请先填写角色名称，以便 AI 生成契合的人物档案');
      return;
    }
    setGeneratingProfile(true);
    try {
      const res = await fetch('/api/admin/character-templates/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          personalityType: formData.personalityType,
        }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'AI 生成失败'));
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setFormData((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          age: data.age ?? prev.profile.age,
          gender: data.gender ?? prev.profile.gender,
          occupation: data.occupation ?? prev.profile.occupation,
          monthlyIncome: data.monthlyIncome ?? prev.profile.monthlyIncome,
          monthlyPayment: data.monthlyPayment ?? prev.profile.monthlyPayment,
          totalInstallments: data.totalInstallments ?? prev.profile.totalInstallments,
          paidInstallments: data.paidInstallments ?? prev.profile.paidInstallments,
          customerSituation: data.customerSituation ?? prev.profile.customerSituation,
          debtAmount: data.debtAmount ?? prev.profile.debtAmount,
          debtDays: data.debtDays ?? prev.profile.debtDays,
          familyStatus: data.familyStatus ?? prev.profile.familyStatus,
          debtReason: data.debtReason ?? prev.profile.debtReason,
          catchphrases: data.catchphrases ?? prev.profile.catchphrases,
          closingPrompt: data.closingPrompt ?? prev.profile.closingPrompt,
        },
      }));
      toast.success('人物档案与借款原因已由 AI 一键生成并自动填充！');
    } catch (err: unknown) {
      toast.error(`生成失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      setGeneratingProfile(false);
    }
  };

  const handleImportTemplateText = async () => {
    if (!templateImportText.trim()) {
      toast.error('请粘贴需要识别的模板文本');
      return;
    }

    setImportingTemplate(true);
    try {
      const res = await fetch('/api/admin/character-templates/parse-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: templateImportText,
          dimensions: formData.dimensions,
        }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'AI 识别失败'));
      }

      const data = (await res.json()) as ParsedCharacterTemplateFormData;
      if (data.error) {
        throw new Error(data.error);
      }

      setFormData((prev) => ({
        ...prev,
        name: data.name ?? prev.name,
        description: data.description ?? prev.description,
        personalityType: data.personalityType ?? prev.personalityType,
        profile: mergeParsedProfile(prev.profile, data.profile),
        dimensions:
          Array.isArray(data.dimensions) && data.dimensions.length > 0
            ? data.dimensions
            : prev.dimensions,
      }));

      toast.success('模板内容已识别并回填，请检查后保存');
      setIsTemplateImportModalOpen(false);
      setTemplateImportText('');
    } catch (err: unknown) {
      toast.error(`识别失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      setImportingTemplate(false);
    }
  };

  const handleExtractDimensions = async () => {
    if (!dimensionAiInputText.trim()) {
      toast.error('请粘贴需要提取的维度文本');
      return;
    }

    setExtractingDimensions(true);
    try {
      const res = await fetch('/api/admin/character-templates/generate-dimensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: dimensionAiInputText,
          dimensions: formData.dimensions,
        }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'AI 提取失败'));
      }
      const data = (await res.json()) as { error?: string; dimensions?: CharacterDimension[] };
      if (data.error) {
        throw new Error(data.error);
      }
      if (!Array.isArray(data.dimensions) || data.dimensions.length === 0) {
        throw new Error('AI 未提取到有效维度');
      }

      setFormData((prev) => ({
        ...prev,
        dimensions: data.dimensions ?? prev.dimensions,
      }));
      toast.success('维度配置已提取并回填，请检查内容后保存');
      setIsDimensionAiModalOpen(false);
      setDimensionAiInputText('');
    } catch (err: unknown) {
      toast.error(`提取失败: ${getErrorMessage(err, '未知错误')}`);
    } finally {
      setExtractingDimensions(false);
    }
  };

  const updateDimension = (index: number, patch: Partial<CharacterDimension>) => {
    setFormData((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  };

  const addDimension = () => {
    setFormData((prev) => ({
      ...prev,
      dimensions: [
        ...prev.dimensions,
        {
          id: `new-${Date.now()}`,
          label: '新维度',
          description: '',
          content: '',
          order: prev.dimensions.length + 1,
          enabled: true,
        },
      ],
    }));
  };

  const removeDimension = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index),
    }));
  };

  const moveDimension = (index: number, direction: -1 | 1) => {
    setFormData((prev) => {
      const newDims = [...prev.dimensions];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= newDims.length) return prev;
      [newDims[index], newDims[targetIndex]] = [newDims[targetIndex], newDims[index]];
      return { ...prev, dimensions: newDims.map((d, i) => ({ ...d, order: i + 1 })) };
    });
  };

  const toggleTag = (tagId: string) => {
    setFormData((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((id) => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const getTagName = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.name || tagId;
  };

  const getTagColor = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.color || '#64748b';
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索角色名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
        <select
          value={filterTagId}
          onChange={(e) => setFilterTagId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="">全部标签</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <button
          onClick={openCreateDialog}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新建角色
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-slate-500">暂无角色模板</div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                  角色名称
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                  类型
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                  关联标签
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">
                  创建时间
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTemplates.map((template) => (
                <tr key={template.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {template.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {template.personalityType || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(template.tagIds || []).map((tagId) => (
                        <span
                          key={tagId}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${getTagColor(tagId)}20`,
                            color: getTagColor(tagId),
                          }}
                        >
                          {getTagName(tagId)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(template.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDuplicate(template)}
                        className="p-2 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="复制"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditDialog(template)}
                        className="p-2 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="编辑"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {editingId ? '编辑角色模板' : '新建角色模板'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsTemplateImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  粘贴识别填充
                </button>
              </div>
              <button
                onClick={() => setDialogOpen(false)}
                className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">角色名称 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    placeholder="如：善意逾期型"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">类型标签</label>
                  <input
                    type="text"
                    value={formData.personalityType}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, personalityType: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    placeholder="如：善意逾期"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  placeholder="简要描述这个角色类型"
                />
              </div>

              {/* Voice TTS configuration */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">角色发音配置 (TTS)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">从系统语音映射中选择</label>
                    <select
                      value={formData.profile.ttsConfig?.voice || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          profile: {
                            ...prev.profile,
                            ttsConfig: {
                              ...prev.profile.ttsConfig,
                              voice: val,
                            },
                          },
                        }));
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="">-- 选择系统已配音色 --</option>
                      {voiceOptions.map((opt) => (
                        <option key={opt.voiceId} value={opt.voiceId}>
                          {opt.name ? `${opt.name} (${opt.voiceId})` : opt.voiceId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      或者直接输入音色 ID (手动配置)
                    </label>
                    <input
                      type="text"
                      value={formData.profile.ttsConfig?.voice || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          profile: {
                            ...prev.profile,
                            ttsConfig: {
                              ...prev.profile.ttsConfig,
                              voice: val,
                            },
                          },
                        }));
                      }}
                      placeholder="如: zh_female_changsheng"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  绑定音色后，系统将自动使用后台配置的语音映射。若音色 ID 在后台没有单独配置 API 密钥，将使用该服务商的全局默认设置。
                </p>
              </div>

              {/* Tag Selection */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">关联标签</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        formData.tagIds.includes(tag.id)
                          ? 'text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                      style={
                        formData.tagIds.includes(tag.id)
                          ? { backgroundColor: tag.color || '#6366f1' }
                          : {}
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profile */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    人物档案
                  </h3>
                  <button
                    type="button"
                    onClick={handleGenerateProfile}
                    disabled={generatingProfile}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors"
                  >
                    {generatingProfile ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {generatingProfile ? '生成中...' : 'AI 一键生成'}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">姓名</label>
                    <input
                      type="text"
                      value={formData.profile.name || ''}
                      onChange={(e) => updateProfile({ name: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">年龄</label>
                    <input
                      type="number"
                      value={formData.profile.age || ''}
                      onChange={(e) =>
                        updateProfile({ age: e.target.value ? Number(e.target.value) : undefined })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">性别</label>
                    <input
                      type="text"
                      value={formData.profile.gender || ''}
                      onChange={(e) => updateProfile({ gender: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">职业</label>
                    <input
                      type="text"
                      value={formData.profile.occupation || ''}
                      onChange={(e) => updateProfile({ occupation: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">月收入</label>
                    <input
                      type="number"
                      value={formData.profile.monthlyIncome || ''}
                      onChange={(e) =>
                        updateProfile({
                          monthlyIncome: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">月供金额</label>
                    <input
                      type="number"
                      value={formData.profile.monthlyPayment || ''}
                      onChange={(e) =>
                        updateProfile({
                          monthlyPayment: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">总期数</label>
                    <input
                      type="number"
                      value={formData.profile.totalInstallments || ''}
                      onChange={(e) =>
                        updateProfile({
                          totalInstallments: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">已还期数</label>
                    <input
                      type="number"
                      value={formData.profile.paidInstallments || ''}
                      onChange={(e) =>
                        updateProfile({
                          paidInstallments: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-xs text-slate-500 mb-1">客户情况</label>
                    <textarea
                      value={formData.profile.customerSituation || ''}
                      onChange={(e) => updateProfile({ customerSituation: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 resize-none"
                      rows={2}
                      placeholder="例如：资方：某某机构，担保主体：xxx担保有限公司，月供2000元，逾期18天，融资36期，已还25期，累计逾期1次。"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">逾期金额</label>
                    <input
                      type="number"
                      value={formData.profile.debtAmount || ''}
                      onChange={(e) =>
                        updateProfile({
                          debtAmount: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">逾期天数</label>
                    <input
                      type="number"
                      value={formData.profile.debtDays || ''}
                      onChange={(e) =>
                        updateProfile({
                          debtDays: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">家庭情况</label>
                    <input
                      type="text"
                      value={formData.profile.familyStatus || ''}
                      onChange={(e) => updateProfile({ familyStatus: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">借款原因</label>
                  <input
                    type="text"
                    value={formData.profile.debtReason || ''}
                    onChange={(e) => updateProfile({ debtReason: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    placeholder="导致逾期的原因"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">还款口头禅</label>
                  <textarea
                    value={formData.profile.catchphrases || ''}
                    onChange={(e) => updateProfile({ catchphrases: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 resize-none"
                    rows={2}
                    placeholder="例如：就不还能怎样；现在没钱，你们看着办。"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">结束提示词</label>
                  <textarea
                    value={formData.profile.closingPrompt || ''}
                    onChange={(e) => updateProfile({ closingPrompt: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 resize-none"
                    rows={2}
                    placeholder="例如：我去想办法，我需要两天时间，两天后肯定处理。"
                  />
                </div>
              </div>

              {/* Dimensions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    维度配置
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsDimensionAiModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI 一键提取
                    </button>
                    <button
                      onClick={addDimension}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      <Plus className="w-3 h-3" />
                      添加维度
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {formData.dimensions.map((dimension, index) => (
                    <div
                      key={dimension.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-slate-400 w-6">{index + 1}</span>
                        <input
                          type="text"
                          value={dimension.label}
                          onChange={(e) => updateDimension(index, { label: e.target.value })}
                          className="flex-1 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                          placeholder="维度名称"
                        />
                        <button
                          onClick={() => moveDimension(index, -1)}
                          disabled={index === 0}
                          className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveDimension(index, 1)}
                          disabled={index === formData.dimensions.length - 1}
                          className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeDimension(index)}
                          className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={dimension.description}
                        onChange={(e) => updateDimension(index, { description: e.target.value })}
                        className="w-full text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                        placeholder="维度描述"
                      />
                      <textarea
                        value={dimension.content}
                        onChange={(e) => updateDimension(index, { content: e.target.value })}
                        rows={2}
                        className="w-full text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 resize-none"
                        placeholder="维度内容（具体角色设定）"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {isTemplateImportModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        粘贴识别填充
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        直接粘贴角色画像、客户情况、催收策略等模板文本，AI 会识别并回填人物档案与维度配置。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsTemplateImportModalOpen(false)}
                      disabled={importingTemplate}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <textarea
                    value={templateImportText}
                    onChange={(e) => setTemplateImportText(e.target.value)}
                    disabled={importingTemplate}
                    rows={14}
                    className="mt-4 w-full text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder={`例如：
角色画像
资方：某某机构，担保主体：xxx担保有限公司，月供2000元，逾期18天，融资36期，已还25期，累计逾期1次，历史最长逾期天数18天。

客户情况：
触发原因 银行卡余额不足、忘记还款日、出差/出国、自动扣款失败未留意短信
沟通表现 接电话态度好，承认逾期，表达歉意，询问"现在还能怎么还"
车辆状态 正常使用，无转移迹象，GPS轨迹正常
资产线索 近期有正常消费记录，其他贷款按时还，社交动态正常
催收策略 提醒为主，协助操作还款，设置自动扣款/日历提醒
还款口头禅 就不还能怎样；现在没钱，你们看着办
结束语提示词 今天下午想想办法、我去找朋友周转`}
                  />

                  <p className="mt-2 text-xs text-slate-400">
                    识别到的字段会覆盖当前表单对应内容，未识别字段保持不变。
                  </p>

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsTemplateImportModalOpen(false)}
                      disabled={importingTemplate}
                      className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleImportTemplateText}
                      disabled={importingTemplate}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {importingTemplate ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          识别中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          识别并填充
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isDimensionAiModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        AI 一键提取维度
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        粘贴包含多个维度的文本，AI 会提取维度名称、描述和内容，并回填到当前表单。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDimensionAiModalOpen(false)}
                      disabled={extractingDimensions}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <textarea
                    value={dimensionAiInputText}
                    onChange={(e) => setDimensionAiInputText(e.target.value)}
                    disabled={extractingDimensions}
                    rows={10}
                    className="mt-4 w-full text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder={`例如：
触发原因：客户因资金周转困难逾期，近期频繁更换联系方式。
沟通表现：前期愿意沟通，但对还款时间反复拖延，容易回避关键问题。
车辆状态：车辆仍在使用中，停放地点不固定。
资产线索：客户有稳定个体经营收入，但现金流紧张。`}
                  />

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsDimensionAiModalOpen(false)}
                      disabled={extractingDimensions}
                      className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleExtractDimensions}
                      disabled={extractingDimensions}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {extractingDimensions ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          提取中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          开始提取
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
