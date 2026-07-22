'use client';

import { useState, useCallback, useEffect } from 'react';
import { Swords, X, Loader2, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ONE_ON_ONE_CONFIG,
  isVisibleOneOnOnePromptDimension,
  type OneOnOneGlobalConfig,
  type OneOnOnePersonaDimension,
} from '@/lib/training/one-on-one-config';

/** Personality modes for the AI sparring partner */
export type TrainingPersonality = string;

/** Structured persona for debt-collection AI roles */
export interface DebtorPersona {
  age?: number;
  gender?: string;
  occupation?: string;
  monthlyIncome?: number;
  monthlyPayment?: number;
  totalInstallments?: number;
  paidInstallments?: number;
  customerSituation?: string;
  debtAmount?: number;
  debtDays?: number;
  debtReason?: string;
  familyStatus?: string;
  personalityType?: string;
  behaviorTraits?: string;
  catchphrases?: string;
  closingPrompt?: string;
  promptDimensions?: OneOnOnePersonaDimension[];
}

export interface TrainingRole {
  name: string;
  description: string;
  persona?: DebtorPersona;
}

export interface TrainingTemplateOption {
  id: string;
  label: string;
  description: string;
  aiRole: TrainingRole;
  background?: string;
  aiFirstMessage?: string;
  scoringDimensions?: unknown[];
  knowledgePoints?: unknown[];
}

export interface TrainingRoleConfig {
  background: string;
  userRole: TrainingRole;
  aiRole: TrainingRole;
  whoSpeaksFirst: 'user' | 'ai';
  aiFirstMessage: string;
  globalConfig?: OneOnOneGlobalConfig;
  selectedTemplateId?: string;
  templateOptions?: TrainingTemplateOption[];
  scoringDimensions?: unknown[];
  knowledgePoints?: unknown[];
}

export interface TrainingStartConfig extends TrainingRoleConfig {
  personality: TrainingPersonality;
}

interface TrainingConfigModalProps {
  open: boolean;
  defaultConfig: TrainingRoleConfig | null;
  loading?: boolean;
  onStart: (config: TrainingStartConfig) => void;
  onClose: () => void;
  /** Optional callback to regenerate role suggestions */
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export function TrainingConfigModal({
  open,
  defaultConfig,
  loading,
  onStart,
  onClose,
  onRegenerate,
  regenerating,
}: TrainingConfigModalProps) {
  const [userRoleName, setUserRoleName] = useState('');
  const [userRoleDesc, setUserRoleDesc] = useState('');
  const [aiRoleName, setAiRoleName] = useState('');
  const [aiRoleDesc, setAiRoleDesc] = useState('');
  const [personality, setPersonality] = useState<TrainingPersonality>('normal');
  const [rolesSwapped, setRolesSwapped] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const personalityOptions = (
    defaultConfig?.globalConfig?.personalities || DEFAULT_ONE_ON_ONE_CONFIG.personalities
  ).filter((item) => item.enabled);
  const visiblePersonalityOptions =
    personalityOptions.length > 0 ? personalityOptions : DEFAULT_ONE_ON_ONE_CONFIG.personalities;
  const templateOptions = !rolesSwapped ? defaultConfig?.templateOptions || [] : [];
  const selectedTemplateOption = templateOptions.find((item) => item.id === selectedTemplateId);
  const activeTemplateOption = !rolesSwapped ? selectedTemplateOption : undefined;
  const currentBackground = activeTemplateOption?.background || defaultConfig?.background || '';
  const currentAiPersona = rolesSwapped
    ? defaultConfig?.userRole.persona
    : activeTemplateOption?.aiRole.persona || defaultConfig?.aiRole.persona;
  const configuredPersonalityType = currentAiPersona?.personalityType?.trim() || '';

  // Sync default config when it arrives
  useEffect(() => {
    if (defaultConfig && open) {
      const initialTemplateId =
        defaultConfig.selectedTemplateId || defaultConfig.templateOptions?.[0]?.id || '';
      const initialTemplateOption = defaultConfig.templateOptions?.find(
        (item) => item.id === initialTemplateId,
      );

      // eslint-disable-next-line react-hooks/set-state-in-effect -- copy async config into editable draft fields.
      setUserRoleName(defaultConfig.userRole.name);
      setUserRoleDesc(defaultConfig.userRole.description);
      setAiRoleName(initialTemplateOption?.aiRole.name || defaultConfig.aiRole.name);
      setAiRoleDesc(initialTemplateOption?.aiRole.description || defaultConfig.aiRole.description);
      setSelectedTemplateId(initialTemplateId);
      setPersonality(
        initialTemplateOption?.label ||
          defaultConfig.globalConfig?.defaultPersonalityId ||
          DEFAULT_ONE_ON_ONE_CONFIG.defaultPersonalityId,
      );
      setRolesSwapped(false);
    }
  }, [defaultConfig, open]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset modal-only draft state after close.
      setPersonality('normal');
      setRolesSwapped(false);
      setSelectedTemplateId('');
    }
  }, [open]);

  const handleSwapRoles = useCallback(() => {
    setUserRoleName((prev) => {
      setAiRoleName(prev);
      return aiRoleName;
    });
    setUserRoleDesc((prev) => {
      setAiRoleDesc(prev);
      return aiRoleDesc;
    });
    setRolesSwapped((v) => !v);
  }, [aiRoleName, aiRoleDesc]);

  const handleTemplateSelect = useCallback((option: TrainingTemplateOption) => {
    setSelectedTemplateId(option.id);
    setAiRoleName(option.aiRole.name);
    setAiRoleDesc(option.aiRole.description);
    setPersonality(option.label);
  }, []);

  const handleStart = useCallback(() => {
    if (!defaultConfig) return;
    onStart({
      background: activeTemplateOption?.background || defaultConfig.background,
      userRole: { name: userRoleName, description: userRoleDesc },
      aiRole: {
        name: aiRoleName,
        description: aiRoleDesc,
        persona: rolesSwapped
          ? defaultConfig.userRole.persona
          : activeTemplateOption?.aiRole.persona || defaultConfig.aiRole.persona,
      },
      whoSpeaksFirst: defaultConfig.whoSpeaksFirst,
      aiFirstMessage: activeTemplateOption?.aiFirstMessage || defaultConfig.aiFirstMessage,
      personality,
      globalConfig: defaultConfig.globalConfig,
      selectedTemplateId: activeTemplateOption?.id || defaultConfig.selectedTemplateId,
      templateOptions: defaultConfig.templateOptions,
      scoringDimensions: activeTemplateOption?.scoringDimensions || defaultConfig.scoringDimensions,
      knowledgePoints: activeTemplateOption?.knowledgePoints || defaultConfig.knowledgePoints,
    });
  }, [
    defaultConfig,
    activeTemplateOption,
    userRoleName,
    userRoleDesc,
    aiRoleName,
    aiRoleDesc,
    personality,
    rolesSwapped,
    onStart,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[420px] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Swords className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">一对一对练</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">配置角色后开始对练</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                正在根据章节内容推荐角色...
              </p>
            </div>
          ) : (
            <>
              {/* Background hint */}
              {currentBackground && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    📋 {currentBackground}
                  </p>
                </div>
              )}

              {/* Regenerate button */}
              {onRegenerate && (
                <div className="flex justify-end">
                  <button
                    onClick={onRegenerate}
                    disabled={regenerating}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all',
                      regenerating
                        ? 'text-gray-400 cursor-wait'
                        : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20',
                    )}
                  >
                    <RefreshCw className={cn('w-3 h-3', regenerating && 'animate-spin')} />
                    {regenerating ? '重新生成中...' : '换一批角色'}
                  </button>
                </div>
              )}

              {/* User Role */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  你的角色
                </label>
                <input
                  type="text"
                  value={userRoleName}
                  onChange={(e) => setUserRoleName(e.target.value)}
                  placeholder="角色名称"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
                />
                <textarea
                  value={userRoleDesc}
                  onChange={(e) => setUserRoleDesc(e.target.value)}
                  placeholder="角色描述"
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              {/* ── Swap button ── */}
              <div className="flex items-center justify-center">
                <button
                  onClick={handleSwapRoles}
                  title="互换角色"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 active:scale-90',
                    rolesSwapped
                      ? 'border-amber-400 bg-amber-50 text-amber-600 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800',
                  )}
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  {rolesSwapped ? '已互换' : '互换角色'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  AI 陪练角色
                </label>
                <input
                  type="text"
                  value={aiRoleName}
                  onChange={(e) => setAiRoleName(e.target.value)}
                  placeholder="角色名称"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                />
                <textarea
                  value={aiRoleDesc}
                  onChange={(e) => setAiRoleDesc(e.target.value)}
                  placeholder="角色描述"
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all resize-none leading-relaxed"
                />

                {/* Debtor Persona Card — hidden when roles are swapped */}
                {!rolesSwapped &&
                  currentAiPersona &&
                  (() => {
                    const p = currentAiPersona;
                    const visiblePromptDimensions = (p.promptDimensions || []).filter(
                      isVisibleOneOnOnePromptDimension,
                    );
                    const hasPromptCustomerSituation = visiblePromptDimensions.some(
                      (dimension) => dimension.label.trim() === '客户情况',
                    );
                    const synthesizedCustomerSituation = [
                      p.monthlyPayment !== undefined
                        ? `月供 ${p.monthlyPayment.toLocaleString()} 元`
                        : '',
                      p.totalInstallments !== undefined ? `共 ${p.totalInstallments} 期` : '',
                      p.paidInstallments !== undefined ? `已还 ${p.paidInstallments} 期` : '',
                    ]
                      .filter(Boolean)
                      .join('，');
                    const fallbackCustomerSituation = hasPromptCustomerSituation
                      ? ''
                      : p.customerSituation || synthesizedCustomerSituation;
                    const rows: { icon: string; label: string; value: string }[] = [
                      p.age !== undefined && {
                        icon: '🎂',
                        label: '年龄',
                        value: `${p.age}岁${p.gender ? '·' + p.gender : ''}`,
                      },
                      p.occupation && { icon: '💼', label: '职业', value: p.occupation },
                      p.monthlyIncome !== undefined && {
                        icon: '💰',
                        label: '月收入',
                        value: `约 ${p.monthlyIncome.toLocaleString()} 元`,
                      },
                      fallbackCustomerSituation && {
                        icon: '📋',
                        label: '客户情况',
                        value: fallbackCustomerSituation,
                      },
                      p.debtAmount !== undefined && {
                        icon: '💳',
                        label: '逾期情况',
                        value: `${p.debtAmount.toLocaleString()} 元${p.debtDays ? '（逾期 ' + p.debtDays + ' 天）' : ''}`,
                      },
                      p.debtReason && { icon: '📖', label: '借款原因', value: p.debtReason },
                      p.familyStatus && { icon: '👨‍👩‍👧‍👦', label: '家庭情况', value: p.familyStatus },
                      p.personalityType && {
                        icon: '🎭',
                        label: '性格类型',
                        value: p.personalityType,
                      },
                      p.behaviorTraits && {
                        icon: '🗣️',
                        label: '惯用话术',
                        value: p.behaviorTraits,
                      },
                      p.catchphrases && {
                        icon: '🗯️',
                        label: '口头禅',
                        value: p.catchphrases,
                      },
                      p.closingPrompt && {
                        icon: '✅',
                        label: '结束话术',
                        value: p.closingPrompt,
                      },
                      ...visiblePromptDimensions.map((dimension) => ({
                        icon: '🧩',
                        label: dimension.label,
                        value: dimension.content,
                      })),
                    ].filter(Boolean) as { icon: string; label: string; value: string }[];

                    if (rows.length === 0) return null;
                    return (
                      <div className="mt-1 rounded-xl border border-emerald-200/70 dark:border-emerald-700/40 bg-emerald-50/60 dark:bg-emerald-900/10 overflow-hidden">
                        <div className="px-3 py-1.5 border-b border-emerald-200/60 dark:border-emerald-700/30 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                            人物档案
                          </span>
                          <span className="text-[9px] text-emerald-600/60 dark:text-emerald-500/60">
                            AI 将严格按此人设扮演
                          </span>
                        </div>
                        <div className="px-3 py-2 grid grid-cols-1 gap-1">
                          {rows.map((row) => (
                            <div key={row.label} className="flex items-start gap-2 min-w-0">
                              <span className="text-[11px] shrink-0 mt-0.5">{row.icon}</span>
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0 w-14">
                                {row.label}
                              </span>
                              <span className="text-[10px] text-gray-700 dark:text-gray-300 leading-relaxed">
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
              </div>

              {/* Personality */}
              {templateOptions.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    陪练性格
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {templateOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleTemplateSelect(option)}
                        className={cn(
                          'flex min-h-[72px] flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-all duration-150 active:scale-95',
                          selectedTemplateId === option.id
                            ? 'border-amber-400 bg-amber-50 shadow-sm dark:border-amber-500 dark:bg-amber-900/30'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600',
                        )}
                      >
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            selectedTemplateId === option.id
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-gray-700 dark:text-gray-300',
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="line-clamp-2 text-[9px] leading-tight text-gray-500 dark:text-gray-400">
                          {option.description}
                        </span>
                        <span className="mt-auto rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          来自角色模板
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : configuredPersonalityType ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    陪练性格
                  </label>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        {configuredPersonalityType}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        来自角色模板
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    陪练性格
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {visiblePersonalityOptions.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPersonality(p.id)}
                        className={cn(
                          'flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all duration-150',
                          'text-center cursor-pointer active:scale-95',
                          personality === p.id
                            ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800',
                        )}
                      >
                        <span className="text-lg">{p.label.slice(0, 1)}</span>
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            personality === p.id
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-gray-700 dark:text-gray-300',
                          )}
                        >
                          {p.label}
                        </span>
                        <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                          {p.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleStart}
              disabled={!userRoleName || !aiRoleName}
              className={cn(
                'px-5 py-2 text-xs font-bold rounded-lg transition-all duration-150 active:scale-95',
                userRoleName && aiRoleName
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
              )}
            >
              开始对练
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
