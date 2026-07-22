'use client';

import { X, MessageSquare, Clock, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScoreRingGauge } from './score-ring-gauge';
import { ScoringTreeView } from './scoring-tree-view';
import type { TrainingReportData } from './training-report-card';

interface TrainingReportPanelProps {
  readonly report: TrainingReportData;
  readonly onClose?: () => void;
  readonly className?: string;
}

interface TrainingReportModalProps {
  readonly report: TrainingReportData;
  readonly onClose: () => void;
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

export function TrainingReportPanel({ report, onClose, className }: TrainingReportPanelProps) {
  const emoji = report.totalScore >= 80 ? '🎉' : report.totalScore >= 60 ? '👍' : '💪';
  const rounds = report.dialogueRounds ?? report.rounds;

  return (
    <div className={cn('relative w-full bg-white dark:bg-gray-900 overflow-hidden flex flex-col', className)}>
      {/* Header - Red gradient with glowing ring gauge */}
      <div className="relative bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 dark:from-rose-600 dark:via-red-600 dark:to-orange-600 px-6 py-8 text-center shrink-0">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Large Ring Gauge */}
        <div className="relative inline-block mb-3 transition-transform hover:scale-105 duration-300">
          <div className="absolute inset-0 bg-white/20 rounded-full blur-xl scale-95" />
          <div className="relative bg-white/95 dark:bg-gray-900/95 rounded-full p-2.5 shadow-lg">
            <ScoreRingGauge score={report.totalScore} size={110} strokeWidth={8} />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white tracking-wide">
          {emoji} {report.scoreTree?.configName || '训练评估报告'}
        </h2>

        {/* Metadata Cards */}
        <div className="flex justify-center items-center gap-3 mt-4 text-white/90 text-xs">
          {rounds !== undefined && (
            <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{rounds} 轮对话</span>
            </div>
          )}
          {report.duration !== undefined && (
            <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {Math.floor(report.duration / 60)} 分 {report.duration % 60} 秒
              </span>
            </div>
          )}
          {report.difficulty && (
            <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              <span>
                {report.difficulty === 'easy' ? '温和' : report.difficulty === 'medium' ? '质疑' : report.difficulty === 'hard' ? '刁难' : report.difficulty}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Detailed Scores */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            维度得分详情
          </h3>

          {report.scoreTree ? (
            <ScoringTreeView scoreTree={report.scoreTree} />
          ) : (
            /* Fallback/Legacy flat scores */
            <div className="space-y-3">
              {report.scores.map((s, idx) => {
                const pct = s.score;
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 p-4 space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                          {s.dimensionName}
                        </span>
                        <span className={cn('font-bold text-sm tabular-nums', scoreColor(pct))}>
                          {s.score}分
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-1000 ease-out', barColor(pct))}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {s.feedback && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
                        {s.feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary / Instructor feedback */}
        {report.summary && (
          <div className="bg-red-50/50 dark:bg-red-900/10 rounded-2xl p-5 border border-red-100/40 dark:border-red-900/20">
            <div className="text-xs font-semibold text-red-500 dark:text-red-400 mb-2 tracking-wider uppercase">
              📝 讲师总评
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-normal">
              {report.summary}
            </p>
          </div>
        )}

        {/* Highlights & Improvements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.highlights && report.highlights.length > 0 && (
            <div className="bg-green-50/40 dark:bg-green-900/10 rounded-2xl p-5 border border-green-100/40 dark:border-green-900/20">
              <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2.5 tracking-wider uppercase">
                ✨ 优点与闪光点
              </div>
              <div className="space-y-2">
                {report.highlights.map((h, idx) => (
                  <div
                    key={idx}
                    className="text-xs text-gray-600 dark:text-gray-300 flex gap-2 leading-relaxed"
                  >
                    <span className="text-green-400 shrink-0 select-none">•</span>
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.improvements && report.improvements.length > 0 && (
            <div className="bg-amber-50/40 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-100/40 dark:border-amber-900/20">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2.5 tracking-wider uppercase">
                📈 待改进建议
              </div>
              <div className="space-y-2">
                {report.improvements.map((imp, idx) => (
                  <div
                    key={idx}
                    className="text-xs text-gray-600 dark:text-gray-300 flex gap-2 leading-relaxed"
                  >
                    <span className="text-amber-400 shrink-0 select-none">•</span>
                    <span>{imp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TrainingReportModal({ report, onClose }: TrainingReportModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transform scale-100 transition-all duration-300 animate-in fade-in zoom-in-95">
        <TrainingReportPanel report={report} onClose={onClose} className="h-full max-h-[90vh]" />
      </div>
    </div>
  );
}
