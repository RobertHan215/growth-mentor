'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  User,
  Users,
  BookOpen,
  Bot,
  Calendar,
  Clock,
  MessageSquare,
  Trophy,
  Loader2,
  ChevronRight,
  Award,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LearningRecord {
  id: string;
  type: 'teaching' | 'oneOnOne';
  userId: string;
  userName: string;
  userAvatar: string | null;
  stageId: string;
  stageName: string;
  totalScore: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasSummary?: boolean;
  difficulty?: string;
  rounds?: number;
  duration?: number;
}

export default function CourseStudentStatsPage({ params }: { params: Promise<{ stageId: string }> }) {
  const resolvedParams = use(params);
  const stageId = resolvedParams.stageId;
  const router = useRouter();

  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/learning-records?stageId=${stageId}`);
      const data = await res.json();

      if (res.ok) {
        setRecords(data.records || []);
      } else {
        toast.error(data.error || '获取学习记录失败');
      }
    } catch (err) {
      console.error('Failed to load learning records:', err);
      toast.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [stageId]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 85) return 'from-emerald-500 to-teal-500 shadow-emerald-500/10 text-white';
    if (score >= 60) return 'from-amber-500 to-orange-500 shadow-amber-500/10 text-white';
    return 'from-rose-500 to-red-500 shadow-rose-500/10 text-white';
  };

  // Derive course info from records
  const courseName = records.length > 0 ? records[0].stageName : '未知课程';
  const courseMode = records.length > 0 ? records[0].type : null;

  // Unique students
  const uniqueStudentIds = new Set(records.map((r) => r.userId));
  const totalStudents = uniqueStudentIds.size;

  // Average score (oneOnOne records only)
  const oneOnOneScores = records
    .filter((r) => r.type === 'oneOnOne' && r.totalScore !== null)
    .map((r) => r.totalScore as number);
  const avgScore = oneOnOneScores.length > 0
    ? Math.round(oneOnOneScores.reduce((a, b) => a + b, 0) / oneOnOneScores.length)
    : 0;

  // Total records count
  const totalRecords = records.length;

  return (
    <div className="space-y-6 pb-12">
      {/* Back button + title */}
      <div className="flex items-center gap-4">
        <Button
          onClick={() => router.back()}
          variant="outline"
          size="icon"
          className="h-9 w-9 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            课程学员统计
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">查看该课程下所有学员的学习记录与表现数据</p>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : records.length === 0 ? (
        /* Empty state */
        <div className="text-center py-24 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3">
          <Award className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-base font-semibold text-slate-600 dark:text-slate-400">暂无学员学习记录</p>
          <p className="text-xs text-slate-400">该课程下暂未有学员参与学习</p>
        </div>
      ) : (
        <>
          {/* Course Info Card */}
          <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-transparent border border-white/20 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Left: Course icon + name */}
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-md">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">
                    {courseName}
                  </h2>
                  <div className="mt-1.5">
                    {courseMode === 'oneOnOne' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                        <Bot className="w-3.5 h-3.5" /> 一对一陪练
                      </span>
                    ) : courseMode === 'teaching' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                        <BookOpen className="w-3.5 h-3.5" /> 教学模式
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Right: Stats */}
              <div className="flex items-center gap-4 flex-wrap">
                {/* Total students */}
                <div className="bg-white/40 dark:bg-slate-900/40 p-3 rounded-xl border border-white/20 dark:border-slate-800 min-w-[100px]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">学员数</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {totalStudents}
                    <span className="text-xs font-normal text-slate-400 ml-1">人</span>
                  </p>
                </div>

                {/* Average score */}
                <div className="bg-white/40 dark:bg-slate-900/40 p-3 rounded-xl border border-white/20 dark:border-slate-800 min-w-[100px]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">平均分</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {oneOnOneScores.length > 0 ? avgScore : '—'}
                    {oneOnOneScores.length > 0 && <span className="text-xs font-normal text-slate-400 ml-1">分</span>}
                  </p>
                </div>

                {/* Total records */}
                <div className="bg-white/40 dark:bg-slate-900/40 p-3 rounded-xl border border-white/20 dark:border-slate-800 min-w-[100px]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Activity className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">记录数</span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {totalRecords}
                    <span className="text-xs font-normal text-slate-400 ml-1">条</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Student Records Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {records.map((record) => {
              const isOneOnOne = record.type === 'oneOnOne';

              return (
                <div
                  key={record.id}
                  className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-red-500/20 dark:hover:border-red-500/20 transition-all duration-300 flex flex-col justify-between group"
                >
                  {/* Visual Accent Gradient based on mode */}
                  <div
                    className={cn(
                      'absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r',
                      isOneOnOne ? 'from-blue-500 to-indigo-500' : 'from-emerald-500 to-teal-500'
                    )}
                  />

                  {/* Card Body */}
                  <div className="p-5 flex-1 space-y-4">
                    {/* Top user row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-white shrink-0 text-sm font-semibold overflow-hidden border border-slate-200/40 dark:border-slate-700/40">
                          {record.userAvatar ? (
                            <img
                              src={record.userAvatar}
                              alt={record.userName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm block truncate">
                            {record.userName}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                            ID: {record.userId.slice(0, 8)}...
                          </span>
                        </div>
                      </div>

                      {/* Mode tag */}
                      {isOneOnOne ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                          <Bot className="w-3 h-3" />
                          对练
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                          <BookOpen className="w-3 h-3" />
                          教学
                        </span>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-100 dark:bg-slate-800/80" />

                    {/* Status/Performance metrics section */}
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3.5 border border-slate-100/50 dark:border-slate-800/50">
                      {isOneOnOne ? (
                        /* One-on-one sparring metrics layout */
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              对练: {formatDuration(record.duration)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                              轮数: {record.rounds ?? '—'} 轮
                            </span>
                          </div>

                          {/* Sparring score badge */}
                          {record.totalScore !== null && (
                            <div
                              className={cn(
                                'w-14 h-14 rounded-xl flex flex-col items-center justify-center shadow-sm bg-gradient-to-br font-bold border-2 border-white/20',
                                getScoreColorClass(record.totalScore)
                              )}
                            >
                              <span className="text-lg leading-none">{record.totalScore}</span>
                              <span className="text-[8px] opacity-75 font-normal mt-0.5">得分</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Teaching mode progress metrics layout */
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              更新: {formatDate(record.updatedAt).split(' ')[0]}
                            </span>
                          </div>

                          {/* Status Badges */}
                          {record.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30">
                              已结课
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50">
                              学习中
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer / Action */}
                  <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/20 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(record.createdAt)}
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        router.push(`/admin/learning-records/${record.id}?type=${record.type}`)
                      }
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold gap-1 group/btn p-0 px-2 h-7"
                    >
                      查看详情
                      <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
