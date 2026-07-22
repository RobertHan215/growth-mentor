'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScoreRingGauge } from './score-ring-gauge';
import { TrainingReportModal } from './training-report-modal';
import type { ScoringResultSnapshot } from '@/lib/types/one-on-one-scoring';

export interface TrainingReportData {
  totalScore: number;
  scores: Array<{ dimensionName: string; score: number; feedback: string }>;
  scoreTree?: ScoringResultSnapshot;
  summary: string;
  highlights: string[];
  improvements: string[];
  completedObjectives?: string[];
  difficulty?: string;
  dialogueRounds?: number;
  rounds?: number;
  duration?: number;
  isRegenerated?: boolean;
  reportIndex?: number;
  createdAt?: string;
}

interface TrainingReportCardProps {
  readonly report: TrainingReportData;
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

export function TrainingReportCard({ report, className }: TrainingReportCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 提取一级指标摘要
  const summaryItems = report.scoreTree
    ? report.scoreTree.primary.map((p) => ({
        name: p.name,
        pct: percent(p.score, p.maxScore),
        scoreStr: `${p.score}/${p.maxScore}`,
      }))
    : report.scores.map((s) => ({
        name: s.dimensionName,
        pct: s.score,
        scoreStr: `${s.score}分`,
      }));

  // 在气泡卡片中，最多展示前 3 个维度以防内容过多
  const displayItems = summaryItems.slice(0, 3);

  const emoji = report.totalScore >= 80 ? '🎉' : report.totalScore >= 60 ? '👍' : '💪';

  return (
    <>
      <div
        onClick={() => setIsModalOpen(true)}
        className={cn(
          'w-full max-w-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-800/50',
          'rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-md hover:shadow-xl',
          'transition-all duration-300 ease-out cursor-pointer group relative overflow-hidden p-4',
          className
        )}
      >
        {/* Decorative backdrop light glow */}
        <div className="absolute -right-16 -top-16 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all duration-500" />

        <div className="flex gap-4 items-center">
          {/* Left: Mini Ring Gauge */}
          <div className="relative shrink-0 transition-transform duration-500 group-hover:scale-105">
            <ScoreRingGauge score={report.totalScore} size={72} strokeWidth={6} />
            <span className="absolute -top-1 -right-1 text-base">{emoji}</span>
          </div>

          {/* Right: Score overview & primary progress bars */}
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {report.scoreTree?.configName || '训练评估报告'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors flex items-center gap-0.5">
                点击详情 ↗
              </span>
            </div>

            {/* Micro Progress Bars */}
            <div className="space-y-1.5">
              {displayItems.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                      {item.name}
                    </span>
                    <span className={cn('font-medium tabular-nums', scoreColor(item.pct))}>
                      {item.scoreStr}
                    </span>
                  </div>
                  <div className="h-1 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000 ease-out', barColor(item.pct))}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <TrainingReportModal report={report} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}
