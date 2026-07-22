'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  X,
  MessageSquare,
  TrendingUp,
  ChevronRight,
  Trophy,
  Target,
  Loader2,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  TrainingReportCard,
  type TrainingReportData,
} from '@/components/training/training-report-card';
import { TrainingReportPanel } from '@/components/training/training-report-modal';
import type { ScoringResultSnapshot } from '@/lib/types/one-on-one-scoring';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  stageId: string;
  stageName?: string;
}

interface TrainingResultItem {
  id: string;
  sessionId: string;
  totalScore: number;
  scores: { dimensionName: string; score: number; feedback?: string }[] | ScoringResultSnapshot;
  scoreTree?: ScoringResultSnapshot;
  summary: string;
  highlights: string[];
  improvements: string[];
  rounds: number;
  duration: number;
  difficulty: string;
  createdAt: string;
  isRegenerated?: boolean;
  reportIndex?: number;
}

interface ChatSessionItem {
  id: string;
  title: string;
  config: {
    totalScore?: number;
    roleConfig?: { userRole?: { name: string }; aiRole?: { name: string } };
    report?: {
      totalScore: number;
      scores: { dimensionName: string; score: number; feedback?: string }[] | ScoringResultSnapshot;
      scoreTree?: ScoringResultSnapshot;
      summary: string;
      highlights: string[];
      improvements: string[];
      rounds: number;
      duration: number;
      difficulty: string;
    };
  };
  messages: { role: string; content: string; timestamp: number; audioUrl?: string }[];
  createdAt: string;
}

interface GrowthDimension {
  dimensionName: string;
  firstScore: number;
  latestScore: number;
  improvement: number;
  trend: 'up' | 'down' | 'stable';
  history: number[];
}

type TabType = 'chats' | 'records';
type TrainingReportSource = TrainingResultItem | NonNullable<ChatSessionItem['config']['report']>;

function toTrainingReportData(report: TrainingReportSource): TrainingReportData {
  return {
    ...report,
    dialogueRounds: report.rounds,
    scores: Array.isArray(report.scores)
      ? report.scores.map((score) => ({
          ...score,
          feedback: score.feedback || '',
        }))
      : [],
    scoreTree: report.scoreTree ?? (Array.isArray(report.scores) ? undefined : report.scores),
    isRegenerated: (report as Record<string, unknown>).isRegenerated as boolean | undefined,
    reportIndex: (report as Record<string, unknown>).reportIndex as number | undefined,
  };
}

export function HistoryDrawer({ open, onClose, stageId, stageName }: HistoryDrawerProps) {
  const [tab, setTab] = useState<TabType>('records');
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [reevaluatingSessionId, setReevaluatingSessionId] = useState<string | null>(null);
  const [reeevaluateError, setReevaluateError] = useState<string | null>(null);

  const handlePlayAudio = (url: string) => {
    if (playingAudioUrl === url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioUrl(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingAudioUrl(url);
      audio.play().catch((err) => {
        console.error('Failed to play audio:', err);
        setPlayingAudioUrl(null);
      });
      audio.onended = () => {
        setPlayingAudioUrl(null);
        audioRef.current = null;
      };
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TrainingResultItem[]>([]);
  const [growthData, setGrowthData] = useState<GrowthDimension[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionItem[]>([]);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<{
    stageId: string;
    result: TrainingResultItem;
  } | null>(null);
  const [stats, setStats] = useState({ totalAttempts: 0, bestScore: 0, latestScore: 0 });
  const selectedResult = selectedReport?.stageId === stageId ? selectedReport.result : null;
  const handleClose = useCallback(() => {
    setSelectedReport(null);
    onClose();
  }, [onClose]);

  const loadData = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    try {
      // Load training results
      const historyRes = await fetch(`/api/training/history?stageId=${stageId}`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setResults(data.results || []);
        setGrowthData(data.growthData || []);
        setStats({
          totalAttempts: data.totalAttempts || 0,
          bestScore: data.bestScore || 0,
          latestScore: data.latestScore || 0,
        });
      }

      // Load chat sessions
      const chatRes = await fetch(`/api/training/chat-sessions?stageId=${stageId}`);
      if (chatRes.ok) {
        const data = await chatRes.json();
        setChatSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setLoading(false);
  }, [stageId]);

  const pollJobStatus = useCallback((jobId: string, _sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/evaluate-jobs/${jobId}`);
        if (res.ok) {
          const job = await res.json();
          if (job.status === 'completed') {
            clearInterval(interval);
            await loadData();
            setReevaluatingSessionId(null);
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setReevaluateError(job.message || '评估任务失败');
            setReevaluatingSessionId(null);
          }
        } else {
          clearInterval(interval);
          setReevaluateError('获取评估任务状态失败');
          setReevaluatingSessionId(null);
        }
      } catch {
        clearInterval(interval);
        setReevaluatingSessionId(null);
      }
    }, 2000);
  }, [loadData]);

  const handleReevaluate = useCallback(async (sessionId: string) => {
    if (!sessionId || reevaluatingSessionId) return;
    setReevaluatingSessionId(sessionId);
    setReevaluateError(null);
    try {
      const res = await fetch(`/api/training/history/${sessionId}/reevaluate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to trigger re-evaluation');
      }
      const data = await res.json();
      const jobId = data.jobId;
      pollJobStatus(jobId, sessionId);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : '重新评估失败';
      setReevaluateError(message);
      setReevaluatingSessionId(null);
    }
  }, [reevaluatingSessionId, pollJobStatus]);

  useEffect(() => {
    if (selectedReport && results.length > 0) {
      const updated = results.find((r) => r.id === selectedReport.result.id || r.sessionId === selectedReport.result.sessionId);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedReport.result)) {
        setSelectedReport({ stageId, result: updated });
      }
    }
  }, [results, selectedReport, stageId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loadData]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  const scoreColor = (s: number) => s >= 80 ? 'text-green-500' : s >= 60 ? 'text-amber-500' : 'text-red-500';
  const scoreBg = (s: number) => s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/30"
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[81] w-[480px] max-w-[calc(100vw-1rem)] bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200/60 dark:border-gray-800 flex flex-col"
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800 dark:text-white">训练记录</h2>
                {stageName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[300px]">{stageName}</p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 px-6 py-3 flex gap-1 bg-gray-50/50 dark:bg-gray-800/30">
              {([
                { id: 'records' as const, label: '学习记录', icon: TrendingUp },
                { id: 'chats' as const, label: '对话记录', icon: MessageSquare },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    tab === id
                      ? 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {selectedResult ? (
                <div className="h-full flex flex-col">
                  <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      返回历史成绩
                    </button>
                    {selectedResult.sessionId && (
                      <button
                        type="button"
                        disabled={reevaluatingSessionId === selectedResult.sessionId}
                        onClick={() => handleReevaluate(selectedResult.sessionId)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all",
                          reevaluatingSessionId === selectedResult.sessionId
                            ? "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed"
                            : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                        )}
                      >
                        <RefreshCw className={cn("w-3 h-3", reevaluatingSessionId === selectedResult.sessionId && "animate-spin")} />
                        {reevaluatingSessionId === selectedResult.sessionId ? "重新评估中..." : "重新评估(最新配置)"}
                      </button>
                    )}
                  </div>
                  {reeevaluateError && (
                    <div className="shrink-0 px-6 py-2 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 text-xs font-medium border-b border-red-100/50">
                      重新评估失败: {reeevaluateError}
                    </div>
                  )}
                  <TrainingReportPanel
                    report={toTrainingReportData(selectedResult)}
                    className="flex-1"
                  />
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-sm">加载中...</p>
                </div>
              ) : tab === 'records' ? (
                <div className="p-6 space-y-6">
                  {/* Stats cards */}
                  {stats.totalAttempts > 0 ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.totalAttempts}</div>
                          <div className="text-[11px] text-red-500/70 mt-1">练习次数</div>
                        </div>
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.bestScore}</div>
                          <div className="text-[11px] text-amber-500/70 mt-1">最高分</div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.latestScore}</div>
                          <div className="text-[11px] text-green-500/70 mt-1">最近分数</div>
                        </div>
                      </div>

                      {/* Growth chart */}
                      {growthData.length > 0 && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            能力成长
                          </h3>
                          <div className="space-y-3">
                            {growthData.map((gd, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className="w-20 text-xs text-gray-500 dark:text-gray-400 truncate shrink-0">{gd.dimensionName}</span>
                                <div className="flex-1 flex items-center gap-2">
                                  <span className="text-xs text-gray-400 w-6 text-right">{gd.firstScore}</span>
                                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                                    <div className={cn('h-full rounded-full', scoreBg(gd.latestScore))} style={{ width: `${gd.latestScore}%` }} />
                                  </div>
                                  <span className={cn('text-xs font-bold w-6', scoreColor(gd.latestScore))}>{gd.latestScore}</span>
                                </div>
                                <span className={cn(
                                  'text-[10px] font-bold px-1.5 py-0.5 rounded',
                                  gd.improvement > 0
                                    ? 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
                                    : gd.improvement < 0
                                      ? 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
                                      : 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
                                )}>
                                  {gd.improvement > 0 ? `+${gd.improvement}` : gd.improvement === 0 ? '—' : gd.improvement}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Result list */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-amber-500" />
                          历史成绩
                        </h3>
                        <div className="space-y-2">
                          {results.slice().reverse().map((r) => (
                            <button
                              type="button"
                              key={r.id}
                              onClick={() => setSelectedReport({ stageId, result: r })}
                              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 hover:shadow-sm transition-shadow text-left"
                            >
                              <div className={cn(
                                'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm',
                                r.totalScore >= 80 ? 'bg-green-500' : r.totalScore >= 60 ? 'bg-amber-500' : 'bg-red-500',
                              )}>
                                {r.totalScore}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {formatDate(r.createdAt)}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  {r.rounds}轮 · {formatDuration(r.duration)} · {r.difficulty === 'hard' ? '困难' : r.difficulty === 'easy' ? '简单' : '中等'}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <Target className="w-10 h-10 opacity-30 mb-3" />
                      <p className="text-sm">暂无训练记录</p>
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">完成一次对练后将在这里显示</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 space-y-2">
                  {chatSessions.length > 0 ? (
                    chatSessions.slice().reverse().map((cs) => (
                      <div key={cs.id} className="rounded-xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                        <button
                          onClick={() => setExpandedChatId(expandedChatId === cs.id ? null : cs.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors text-left"
                        >
                          <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{cs.title}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {formatDate(cs.createdAt)}
                              {cs.config?.totalScore !== undefined && (
                                <span className={cn('ml-2 font-bold', scoreColor(cs.config.totalScore))}>{cs.config.totalScore}分</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className={cn('w-4 h-4 text-gray-300 transition-transform', expandedChatId === cs.id && 'rotate-90')} />
                        </button>

                        {/* Expanded chat messages */}
                        <AnimatePresence>
                          {expandedChatId === cs.id && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 space-y-3 max-h-[500px] overflow-y-auto border-t border-gray-100 dark:border-gray-800">
                                {(cs.messages as { role: string; content: string; audioUrl?: string }[]).map((msg, i) => (
                                  <div key={i} className={cn('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
                                    <div className={cn(
                                      'max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words',
                                      msg.role === 'user'
                                        ? 'bg-red-500 text-white rounded-tr-md shadow-sm'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700 rounded-tl-md shadow-sm',
                                    )}>
                                      {msg.content}
                                    </div>
                                    {msg.audioUrl && (
                                      <button
                                        onClick={() => handlePlayAudio(msg.audioUrl!)}
                                        className={cn(
                                          'flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-medium transition-all shadow-sm border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900',
                                          playingAudioUrl === msg.audioUrl
                                            ? 'text-red-500 border-red-200 bg-red-50 dark:bg-red-950/20'
                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        )}
                                      >
                                        {playingAudioUrl === msg.audioUrl ? (
                                          <>
                                            <VolumeX className="w-3.5 h-3.5 animate-pulse" /> 停止播放
                                          </>
                                        ) : (
                                          <>
                                            <Volume2 className="w-3.5 h-3.5" /> 播放语音
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                ))}

                                {/* Inline Report Card */}
                                {cs.config?.report && (
                                  <div className="mt-4">
                                    <TrainingReportCard report={toTrainingReportData(cs.config.report)} />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <MessageSquare className="w-10 h-10 opacity-30 mb-3" />
                      <p className="text-sm">暂无对话记录</p>
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">完成对练后将自动保存</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
