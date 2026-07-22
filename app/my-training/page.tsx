'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Trophy, TrendingUp, Target, ChevronRight,
  Loader2, BookOpen, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { APP_NAME, APP_LOGO } from '@/lib/branding';
import { ScoringTreeView } from '@/components/training/scoring-tree-view';
import { TrainingReportCard } from '@/components/training/training-report-card';
import type { ScoringResultSnapshot } from '@/lib/types/one-on-one-scoring';

interface CourseTrainingSummary {
  stageId: string;
  stageName: string;
  totalAttempts: number;
  bestScore: number;
  latestScore: number;
  lastTrainedAt: string;
  avgScore: number;
}

interface TrainingResultDetail {
  id: string;
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
}

interface GrowthDimension {
  dimensionName: string;
  firstScore: number;
  latestScore: number;
  improvement: number;
  trend: 'up' | 'down' | 'stable';
  history: number[];
}

export default function MyTrainingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseTrainingSummary[]>([]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseDetails, setCourseDetails] = useState<Record<string, {
    results: TrainingResultDetail[];
    growthData: GrowthDimension[];
  }>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Load all training data grouped by course
  useEffect(() => {
    if (!session?.user?.id) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/training/my-summary');
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses || []);
        }
      } catch (err) {
        console.error('Failed to load training summary:', err);
      }
      setLoading(false);
    })();
  }, [session?.user?.id]);

  const loadCourseDetails = async (stageId: string) => {
    if (courseDetails[stageId]) return; // already loaded
    setDetailLoading(stageId);
    try {
      const res = await fetch(`/api/training/history?stageId=${stageId}`);
      if (res.ok) {
        const data = await res.json();
        setCourseDetails((prev) => ({
          ...prev,
          [stageId]: {
            results: data.results || [],
            growthData: data.growthData || [],
          },
        }));
      }
    } catch (err) {
      console.error('Failed to load course details:', err);
    }
    setDetailLoading(null);
  };

  const handleToggleCourse = (stageId: string) => {
    if (expandedCourseId === stageId) {
      setExpandedCourseId(null);
    } else {
      setExpandedCourseId(stageId);
      loadCourseDetails(stageId);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  const scoreColor = (s: number) => s >= 80 ? 'text-green-600 dark:text-green-400' : s >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const scoreBg = (s: number) => s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const scoreBorder = (s: number) => s >= 80 ? 'border-green-200 dark:border-green-800' : s >= 60 ? 'border-amber-200 dark:border-amber-800' : 'border-red-200 dark:border-red-800';

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0f]">
        <Loader2 className="w-6 h-6 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0f]">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[url('/edu-bg.png')] bg-cover bg-center bg-no-repeat opacity-100 dark:opacity-10 transition-opacity" />
        <div className="absolute inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-[2px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src={APP_LOGO} alt={APP_NAME} className="h-8 w-auto" />
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-base font-bold text-gray-800 dark:text-white">我的训练</h1>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">加载训练记录...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Target className="w-16 h-16 opacity-20 mb-4" />
            <h2 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">暂无训练记录</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">进入课堂选择一对一模式开始你的第一次对练吧！</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors shadow-sm"
            >
              去学习
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overview stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800 p-6 text-center shadow-sm"
              >
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {courses.reduce((sum, c) => sum + c.totalAttempts, 0)}
                </div>
                <div className="text-xs text-gray-500 mt-1">总练习次数</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800 p-6 text-center shadow-sm"
              >
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {courses.length}
                </div>
                <div className="text-xs text-gray-500 mt-1">已练课程</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800 p-6 text-center shadow-sm"
              >
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {Math.max(...courses.map((c) => c.bestScore), 0)}
                </div>
                <div className="text-xs text-gray-500 mt-1">最高分</div>
              </motion.div>
            </div>

            {/* Course cards */}
            {courses.map((course, i) => (
              <motion.div
                key={course.stageId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card header — clickable */}
                <button
                  onClick={() => handleToggleCourse(course.stageId)}
                  className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-800 dark:text-white truncate">{course.stageName}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> {course.totalAttempts}次练习</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(course.lastTrainedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <div className={cn('text-xl font-bold', scoreColor(course.bestScore))}>{course.bestScore}</div>
                      <div className="text-[10px] text-gray-400">最高</div>
                    </div>
                    <div className="text-center">
                      <div className={cn('text-xl font-bold', scoreColor(course.latestScore))}>{course.latestScore}</div>
                      <div className="text-[10px] text-gray-400">最近</div>
                    </div>
                    <ChevronRight className={cn(
                      'w-5 h-5 text-gray-300 transition-transform duration-200',
                      expandedCourseId === course.stageId && 'rotate-90',
                    )} />
                  </div>
                </button>

                {/* Expanded details */}
                <AnimatePresence>
                  {expandedCourseId === course.stageId && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-5">
                        {detailLoading === course.stageId ? (
                          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">加载中...</span>
                          </div>
                        ) : courseDetails[course.stageId] ? (
                          <>
                            {/* Growth */}
                            {courseDetails[course.stageId].growthData.length > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-green-500" />
                                  能力成长
                                </h4>
                                <div className="space-y-3">
                                  {courseDetails[course.stageId].growthData.map((gd, j) => (
                                    <div key={j} className="flex items-center gap-3">
                                      <span className="w-20 text-xs text-gray-500 truncate shrink-0">{gd.dimensionName}</span>
                                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div className={cn('h-full rounded-full', scoreBg(gd.latestScore))} style={{ width: `${gd.latestScore}%` }} />
                                      </div>
                                      <span className={cn('text-xs font-bold w-8 text-right', scoreColor(gd.latestScore))}>{gd.latestScore}</span>
                                      <span className={cn(
                                        'text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[32px] text-center',
                                        gd.improvement > 0
                                          ? 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
                                          : gd.improvement < 0
                                            ? 'text-red-600 bg-red-100'
                                            : 'text-gray-500 bg-gray-100',
                                      )}>
                                        {gd.improvement > 0 ? `+${gd.improvement}` : gd.improvement === 0 ? '—' : gd.improvement}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* History list */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">历史成绩</h4>
                              <div className="space-y-2">
                                {courseDetails[course.stageId].results.slice().reverse().map((r) => (
                                  <div
                                    key={r.id}
                                    className={cn(
                                      'px-4 py-3 rounded-xl border transition-colors',
                                      scoreBorder(r.totalScore),
                                      'bg-white dark:bg-gray-800/60',
                                    )}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={cn(
                                        'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0',
                                        scoreBg(r.totalScore),
                                      )}>
                                        {r.totalScore}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-700 dark:text-gray-300">
                                          {formatDate(r.createdAt)} {formatTime(r.createdAt)}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                                          <span>{r.rounds}轮</span>
                                          <span>·</span>
                                          <span>{formatDuration(r.duration)}</span>
                                          <span>·</span>
                                          <span>{r.difficulty === 'hard' ? '困难' : r.difficulty === 'easy' ? '简单' : '中等'}</span>
                                        </div>
                                      </div>
                                      {r.summary && (
                                        <div className="max-w-[200px] text-[11px] text-gray-400 leading-relaxed line-clamp-2 hidden md:block">
                                          {r.summary}
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                                      <TrainingReportCard report={r as any} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Quick action */}
                            <div className="text-center pt-2">
                              <button
                                onClick={() => router.push(`/classroom/${course.stageId}`)}
                                className="px-5 py-2 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                              >
                                继续训练
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
