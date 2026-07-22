'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  User,
  BookOpen,
  Bot,
  Calendar,
  Clock,
  MessageSquare,
  Trophy,
  Loader2,
  ChevronRight,
  Award,
  Sparkles,
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

export default function UserLearningProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.userId;
  const router = useRouter();

  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/learning-records?userId=${userId}`);
        const data = await res.json();

        if (res.ok) {
          setRecords(data.records || []);
        } else {
          toast.error(data.error || '获取学习记录失败');
        }
      } catch (err) {
        console.error('Failed to load user learning records:', err);
        toast.error('网络请求失败');
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [userId]);

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

  const getDifficultyLabel = (diff?: string) => {
    if (diff === 'hard') return '困难';
    if (diff === 'easy') return '简单';
    if (diff === 'medium') return '中等';
    return '—';
  };

  // Derive user info from first record
  const userInfo = records.length > 0
    ? { name: records[0].userName, avatar: records[0].userAvatar }
    : null;

  // Stats derivation
  const totalCourses = records.length;
  const totalDuration = records.reduce((acc, cur) => acc + (cur.duration || 0), 0);

  const oneOnOneScores = records
    .filter((r) => r.type === 'oneOnOne' && r.totalScore !== null)
    .map((r) => r.totalScore as number);
  const avgScore = oneOnOneScores.length > 0
    ? Math.round(oneOnOneScores.reduce((a, b) => a + b, 0) / oneOnOneScores.length)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Back Header */}
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
            <Sparkles className="w-5 h-5 text-red-500 animate-pulse" />
            学员学习档案
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">全面洞察该学员的学习路径与训练表现</p>
        </div>
      </div>

      {/* User Profile Card */}
      {!loading && userInfo && (
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-500/5 via-blue-500/5 to-transparent dark:from-violet-950/20 dark:via-blue-950/10 dark:to-transparent border border-white/20 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            {/* Avatar & Name */}
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0 text-xl font-bold overflow-hidden shadow-md ring-4 ring-red-500/10">
                {userInfo.avatar ? (
                  <img src={userInfo.avatar} alt={userInfo.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">
                  {userInfo.name}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
                  ID: {userId.slice(0, 12)}...
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-14 bg-slate-200/50 dark:bg-slate-800/50" />

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6">
              {/* Total Courses */}
              <div className="flex items-center gap-3 bg-white/40 dark:bg-slate-900/40 px-4 py-2.5 rounded-xl border border-white/20 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500 shrink-0">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">课程总数</p>
                  <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">{totalCourses}</p>
                </div>
              </div>

              {/* Average Score */}
              <div className="flex items-center gap-3 bg-white/40 dark:bg-slate-900/40 px-4 py-2.5 rounded-xl border border-white/20 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 shrink-0">
                  <Trophy className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">对练均分</p>
                  <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                    {avgScore}<span className="text-xs font-normal text-slate-400 ml-0.5">分</span>
                  </p>
                </div>
              </div>

              {/* Total Duration */}
              <div className="flex items-center gap-3 bg-white/40 dark:bg-slate-900/40 px-4 py-2.5 rounded-xl border border-white/20 dark:border-slate-800">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-500 shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">训练时长</p>
                  <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                    {Math.floor(totalDuration / 60)}<span className="text-xs font-normal text-slate-400 ml-0.5">分钟</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Records Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-24 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3">
          <Award className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-base font-semibold text-slate-600 dark:text-slate-400">暂无学习记录</p>
          <p className="text-xs text-slate-400">该学员尚未参与任何课程学习或对练</p>
        </div>
      ) : (
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
                  {/* Course name + Mode badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">课程</span>
                      <h4 className="font-bold text-slate-700 dark:text-slate-200 text-base leading-snug line-clamp-2 h-12">
                        {record.stageName}
                      </h4>
                    </div>

                    {/* Mode tag */}
                    {isOneOnOne ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shrink-0">
                        <Bot className="w-3 h-3" />
                        对练
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 shrink-0">
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
                            轮数: {record.rounds} 轮 ({getDifficultyLabel(record.difficulty)})
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
      )}
    </div>
  );
}
