'use client';

import { useEffect, useState } from 'react';
import { Loader2, Target, Award, AlertTriangle, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { OneOnOneScoringCriteria, ScoringMode } from '@/lib/types/one-on-one-scoring';

interface ScoringConfigPreviewDialogProps {
  readonly tagId: string | null;
  readonly tagName?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface ScoringConfigData {
  id: string;
  name: string;
  description: string | null;
  criteria: OneOnOneScoringCriteria;
  enabled: boolean;
}

function modeLabel(mode: ScoringMode): string {
  return mode === 'deduction' ? '扣分制' : '加分制';
}

function modeDescription(criteria: OneOnOneScoringCriteria): string {
  const modes = new Set(criteria.primary.map((primary) => primary.scoringMode));
  if (modes.size > 1) return '混合评分';
  return criteria.primary[0]?.scoringMode === 'deduction' ? '扣分制' : '加分制';
}

function weightLabelFor(mode: ScoringMode): string {
  return mode === 'deduction' ? '最高扣分' : '最高加分';
}

function modeBadgeClass(mode: ScoringMode): string {
  return mode === 'deduction'
    ? 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40';
}

export function ScoringConfigPreviewDialog({
  tagId,
  tagName,
  open,
  onOpenChange,
}: ScoringConfigPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<ScoringConfigData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tagId) {
      setConfig(null);
      setError(null);
      return;
    }

    const loadConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/one-on-one-scoring-configs?tagId=${encodeURIComponent(tagId)}`);
        if (!res.ok) {
          throw new Error('加载评分配置失败');
        }
        const data = await res.json();
        // If API returns null, it means no configuration exists for this tag
        setConfig(data || null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [open, tagId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-6">
        <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <DialogTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            <span>评分标准预览</span>
            {tagName && (
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
                标签: {tagName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            预览该标签下配置的 AI 一对一陪练打分维度及权重明细
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="text-sm text-slate-500 dark:text-slate-400">正在加载评分明细...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
            <AlertTriangle className="w-10 h-10" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !config ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 dark:text-slate-500">
            <HelpCircle className="w-12 h-12 stroke-[1.5]" />
            <span className="text-sm font-medium">该标签暂未关联任何评分配置</span>
            <span className="text-xs text-slate-500 text-center max-w-sm">
              请先在“对练管理 &gt; 评分配置”中为此标签创建并保存评分规则，否则该课程将降级使用系统默认评分。
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Meta details */}
            <div className="flex flex-wrap gap-4 items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/80">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {config.name}
                </div>
                {config.description && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {config.description}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200/60 dark:bg-slate-950/20 dark:text-slate-400 dark:border-slate-800/60"
                >
                  <Award className="w-3.5 h-3.5" />
                  {modeDescription(config.criteria)}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    config.enabled
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {config.enabled ? '已启用' : '已停用'}
                </span>
              </div>
            </div>

            {/* Config Trees */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                评分指标架构树
              </h3>
              <div className="space-y-4">
                {config.criteria.primary.map((p, pIdx) => (
                  <div
                    key={p.id || `p-${pIdx}`}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900"
                  >
                    {/* Primary Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-150 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-blue-500 rounded-sm" />
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          {p.name}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${modeBadgeClass(p.scoringMode)}`}>
                          {modeLabel(p.scoringMode)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                        {weightLabelFor(p.scoringMode)} {p.weight}分
                      </span>
                    </div>

                    {/* Secondary & Details */}
                    <div className="p-4 space-y-4">
                      {p.children.map((s, sIdx) => (
                        <div
                          key={s.id || `s-${sIdx}`}
                          className="pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-3"
                        >
                          {/* Secondary Title */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {s.name}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              {weightLabelFor(p.scoringMode)} {s.weight}分
                            </span>
                          </div>

                          {/* Details details */}
                          <div className="grid grid-cols-1 gap-2 pl-2">
                            {s.details.map((d, dIdx) => (
                              <div
                                key={d.id || `d-${dIdx}`}
                                className="p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    {d.name}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-150 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    {weightLabelFor(p.scoringMode)} {d.weight}分
                                  </span>
                                </div>
                                {d.description && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    {d.description}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
