'use client';

import { cn } from '@/lib/utils';
import type { ScoringMode, ScoringResultSnapshot } from '@/lib/types/one-on-one-scoring';

interface ScoringTreeViewProps {
  readonly scoreTree: ScoringResultSnapshot;
  readonly compact?: boolean;
  readonly className?: string;
}

function percent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.min(Math.max(Math.round((score / maxScore) * 100), 0), 100);
}

function barColor(value: number): string {
  if (value >= 80) return 'bg-gradient-to-r from-green-400 to-green-500';
  if (value >= 60) return 'bg-gradient-to-r from-amber-400 to-amber-500';
  return 'bg-gradient-to-r from-red-400 to-red-500';
}

function scoreColor(value: number): string {
  if (value >= 80) return 'text-green-600 dark:text-green-400';
  if (value >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function modeFrom(value: unknown): ScoringMode {
  return value === 'deduction' ? 'deduction' : 'bonus';
}

function deltaLabel(delta: number, mode: ScoringMode): string {
  if (mode === 'deduction') {
    return delta < 0 ? `${delta} 扣分` : '0 未扣分';
  }
  return delta > 0 ? `+${delta} 加分` : '0 未加分';
}

export function ScoringTreeView({ scoreTree, compact = false, className }: ScoringTreeViewProps) {
  const fallbackMode = modeFrom(scoreTree.scoringMode);

  return (
    <div className={cn('space-y-4', compact && 'space-y-2.5', className)}>
      {/* Summary Row */}
      <div className="flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-800/30 px-3 py-2 rounded-xl border border-gray-100/50 dark:border-gray-800/50">
        <div className="min-w-0">
          <div className={cn('font-bold text-gray-800 dark:text-gray-100 truncate', compact ? 'text-xs' : 'text-sm')}>
            {scoreTree.configName}
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">
            评分配置快照
          </div>
        </div>
        <div className={cn('font-bold tabular-nums shrink-0', compact ? 'text-xs' : 'text-sm', scoreColor(percent(scoreTree.totalScore, scoreTree.maxScore)))}>
          {scoreTree.totalScore}<span className="text-gray-400 font-normal ml-0.5">/ {scoreTree.maxScore}</span>
        </div>
      </div>

      {/* Tree structure */}
      <div className={cn('space-y-3', compact && 'space-y-2')}>
        {scoreTree.primary.map((primary) => {
          const primaryPct = percent(primary.score, primary.maxScore);
          const primaryMode = modeFrom(primary.scoringMode || fallbackMode);
          return (
            <div
              key={primary.id}
              className={cn(
                'rounded-xl border border-gray-100/80 dark:border-gray-800/80 bg-white/50 dark:bg-gray-900/30',
                compact ? 'p-2.5 space-y-2' : 'p-4 space-y-3.5',
              )}
            >
              {/* Level 1: Primary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('font-semibold text-gray-700 dark:text-gray-200 truncate', compact ? 'text-xs' : 'text-sm')}>
                    {primary.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                      {primaryMode === 'deduction' ? '扣分制' : '加分制'}
                    </span>
                    <span className={cn('font-bold tabular-nums', compact ? 'text-xs' : 'text-sm', scoreColor(primaryPct))}>
                      {primary.score}/{primary.maxScore}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-1000 ease-out', barColor(primaryPct))}
                    style={{ width: `${primaryPct}%` }}
                  />
                </div>
              </div>

              {/* Level 2 & 3 */}
              <div className={cn('space-y-2.5 pl-2.5 border-l border-gray-100 dark:border-gray-800', compact && 'space-y-2')}>
                {primary.children.map((secondary) => {
                  const secondaryPct = percent(secondary.score, secondary.maxScore);
                  return (
                    <div key={secondary.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('text-gray-600 dark:text-gray-300 font-medium truncate', compact ? 'text-[10px]' : 'text-xs')}>
                          {secondary.name}
                        </span>
                        <span className={cn('font-semibold tabular-nums shrink-0', compact ? 'text-[10px]' : 'text-xs', scoreColor(secondaryPct))}>
                          {secondary.score}/{secondary.maxScore}
                        </span>
                      </div>

                      {/* Level 3 Details (Omitted in compact mode) */}
                      {!compact && (
                        <div className="space-y-1.5 pl-1.5">
                          {secondary.details.map((detail) => {
                            const detailPct = percent(detail.score, detail.maxScore);
                            const delta = typeof detail.delta === 'number' ? detail.delta : detail.score;
                            const reason = detail.reason || detail.feedback;
                            const evidence = detail.evidence;
                            return (
                              <div
                                key={detail.id}
                                className="rounded-lg bg-gray-50/50 dark:bg-gray-800/10 border border-gray-100/30 dark:border-gray-800/20 px-2.5 py-2 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate">
                                    {detail.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                                      {deltaLabel(delta, primaryMode)}
                                    </span>
                                    <span className={cn('text-[11px] font-bold tabular-nums', scoreColor(detailPct))}>
                                      {detail.score}/{detail.maxScore}
                                    </span>
                                  </div>
                                </div>
                                {reason && (
                                  <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed border-t border-gray-100 dark:border-gray-800/50 pt-1.5 mt-1.5 space-y-0.5">
                                    <p>{reason}</p>
                                    {evidence && <p>聊天记录依据：{evidence}</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
