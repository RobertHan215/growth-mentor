'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Search,
  BookOpen,
  Bot,
  User,
  Users,
  Clock,
  Trophy,
  Loader2,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Activity,
  Award,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ────────────────── Types ────────────────── */

interface UserSummary {
  userId: string;
  userName: string;
  userAvatar: string | null;
  courseCount: number;
  avgScore: number | null;
  lastActive: string;
}

interface CourseSummary {
  stageId: string;
  stageName: string;
  learningMode: 'teaching' | 'oneOnOne';
  coverImage: string | null;
  userCount: number;
  avgScore: number | null;
  lastActive: string;
}

interface AsyncTaskSummary {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  message: string;
  progress: number;
  error: string | null;
  attempt: number;
  retryOfTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  user: { id: string; name: string; avatar: string | null } | null;
  stage: { id: string; name: string } | null;
}

type ViewMode = 'users' | 'courses' | 'tasks';

/* ────────────────── Page ────────────────── */

export default function LearningRecordsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('users');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [tasks, setTasks] = useState<AsyncTaskSummary[]>([]);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);

  /* ── Fetch ── */
  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoint =
        viewMode === 'users'
          ? '/api/admin/learning-records/users'
          : viewMode === 'courses'
            ? '/api/admin/learning-records/courses'
            : '/api/admin/async-tasks?type=training_evaluation';

      const url = search
        ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}search=${encodeURIComponent(search)}`
        : endpoint;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        if (viewMode === 'users') {
          setUsers(data.users ?? []);
        } else if (viewMode === 'courses') {
          setCourses(data.courses ?? []);
        } else {
          setTasks(data.tasks ?? []);
        }
      } else {
        toast.error(data.error || '获取数据失败');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, viewMode]);

  /* ── Helpers ── */
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 85) return 'from-emerald-500 to-teal-500 text-white';
    if (score >= 60) return 'from-amber-500 to-orange-500 text-white';
    return 'from-rose-500 to-red-500 text-white';
  };

  const getTaskStatusLabel = (status: AsyncTaskSummary['status']) => {
    const labels = {
      queued: '排队中',
      running: '生成中',
      succeeded: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return labels[status] ?? status;
  };

  const getTaskStatusClass = (status: AsyncTaskSummary['status']) => {
    if (status === 'succeeded') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-100';
    if (status === 'running') return 'bg-blue-50 text-blue-700 border-blue-100';
    return 'bg-slate-50 text-slate-600 border-slate-100';
  };

  const handleRetryTask = async (taskId: string) => {
    setRetryingTaskId(taskId);
    try {
      const res = await fetch(`/api/admin/async-tasks/${taskId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '重新生成失败');
        return;
      }
      toast.success('已提交重新生成任务');
      await fetchData();
    } catch (err) {
      console.error('Failed to retry task:', err);
      toast.error('重新生成请求失败');
    } finally {
      setRetryingTaskId(null);
    }
  };

  /* ── Aggregate Stats ── */
  const totalUsers = users.length;
  const totalCourses = courses.length;
  const totalTasks = tasks.length;
  const failedTasks = tasks.filter((task) => task.status === 'failed').length;
  const runningTasks = tasks.filter(
    (task) => task.status === 'queued' || task.status === 'running',
  ).length;
  const globalAvgScore =
    viewMode === 'tasks'
      ? tasks.filter((task) => task.status === 'succeeded').length
      : viewMode === 'users'
        ? users.filter((u) => u.avgScore !== null && u.avgScore > 0).length > 0
          ? Math.round(
              users
                .filter((u) => u.avgScore !== null && u.avgScore > 0)
                .reduce((a, b) => a + (b.avgScore ?? 0), 0) /
                users.filter((u) => u.avgScore !== null && u.avgScore > 0).length,
            )
          : 0
        : courses.filter((c) => c.avgScore !== null && c.avgScore > 0).length > 0
          ? Math.round(
              courses
                .filter((c) => c.avgScore !== null && c.avgScore > 0)
                .reduce((a, b) => a + (b.avgScore ?? 0), 0) /
                courses.filter((c) => c.avgScore !== null && c.avgScore > 0).length,
            )
          : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* ───── Header ───── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-red-500 animate-pulse" />
            学习与训练管理中心
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            从学员和课程双维度洞察学习路径与对练表现
          </p>
        </div>
      </div>

      {/* ───── Segmented Control (视角切换) ───── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex bg-slate-100/80 dark:bg-slate-800/40 p-1 rounded-2xl border border-slate-200/20 dark:border-slate-700/20 shadow-sm">
          <button
            onClick={() => {
              setViewMode('users');
              setSearch('');
            }}
            className={cn(
              'px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2',
              viewMode === 'users'
                ? 'bg-white dark:bg-slate-900 text-red-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            <Users className="w-4 h-4" />
            人员视角
          </button>
          <button
            onClick={() => {
              setViewMode('courses');
              setSearch('');
            }}
            className={cn(
              'px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2',
              viewMode === 'courses'
                ? 'bg-white dark:bg-slate-900 text-red-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            <BookOpen className="w-4 h-4" />
            课程视角
          </button>
          <button
            onClick={() => {
              setViewMode('tasks');
              setSearch('');
            }}
            className={cn(
              'px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2',
              viewMode === 'tasks'
                ? 'bg-white dark:bg-slate-900 text-red-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            <Activity className="w-4 h-4" />
            评估任务
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder={
              viewMode === 'users'
                ? '搜索学员姓名...'
                : viewMode === 'courses'
                  ? '搜索课程名称...'
                  : '搜索任务、学员或课程...'
            }
            className="pl-9 h-10 border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ───── Summary Stats ───── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Stat Card 1 */}
        <div className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl group-hover:bg-violet-500/10 transition-colors" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center text-violet-500 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {viewMode === 'users'
                  ? '活跃学员总数'
                  : viewMode === 'courses'
                    ? '开课总数'
                    : '评估任务总数'}
              </p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {viewMode === 'users'
                  ? totalUsers
                  : viewMode === 'courses'
                    ? totalCourses
                    : totalTasks}{' '}
                <span className="text-sm font-normal text-slate-400">
                  {viewMode === 'users' ? '人' : viewMode === 'courses' ? '门' : '条'}
                </span>
              </h3>
            </div>
          </div>
        </div>

        {/* Stat Card 2 */}
        <div className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {viewMode === 'tasks' ? '成功任务数' : '对练平均分数'}
              </p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {globalAvgScore}{' '}
                <span className="text-sm font-normal text-slate-400">
                  {viewMode === 'tasks' ? '条' : '分'}
                </span>
              </h3>
            </div>
          </div>
        </div>

        {/* Stat Card 3 */}
        <div className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-500 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {viewMode === 'users'
                  ? '人均学课数'
                  : viewMode === 'courses'
                    ? '课均学员数'
                    : '失败 / 进行中'}
              </p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {viewMode === 'tasks'
                  ? `${failedTasks}/${runningTasks}`
                  : viewMode === 'users'
                    ? totalUsers > 0
                      ? (users.reduce((a, u) => a + u.courseCount, 0) / totalUsers).toFixed(1)
                      : '0'
                    : totalCourses > 0
                      ? (courses.reduce((a, c) => a + c.userCount, 0) / totalCourses).toFixed(1)
                      : '0'}{' '}
                <span className="text-sm font-normal text-slate-400">
                  {viewMode === 'users' ? '门' : viewMode === 'courses' ? '人' : '条'}
                </span>
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* ───── Content Grid ───── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : viewMode === 'users' ? (
        /* ========== Users View ========== */
        users.length === 0 ? (
          <div className="text-center py-24 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3">
            <Award className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              暂无学员学习记录
            </p>
            <p className="text-xs text-slate-400">学员开始学习课程后，将会在此处展示</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map((user) => (
              <div
                key={user.userId}
                onClick={() => router.push(`/admin/learning-records/user/${user.userId}`)}
                className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-violet-500/20 dark:hover:border-violet-500/20 transition-all duration-300 cursor-pointer group"
              >
                {/* Top accent gradient */}
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-violet-500 to-blue-500" />

                {/* Card Body */}
                <div className="p-5 space-y-4">
                  {/* User row */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white shrink-0 text-lg font-semibold overflow-hidden shadow-md ring-4 ring-violet-500/10">
                      {user.userAvatar ? (
                        <img
                          src={user.userAvatar}
                          alt={user.userName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate">
                        {user.userName}
                      </h3>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        最后活跃: {formatDate(user.lastActive)}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all" />
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-slate-100 dark:bg-slate-800/80" />

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <GraduationCap className="w-4 h-4 text-blue-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {user.courseCount}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">课程数</p>
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <Trophy className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {user.avgScore !== null && user.avgScore > 0 ? user.avgScore : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">均分</p>
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <Clock className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {formatDate(user.lastActive).slice(5)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">活跃</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : viewMode === 'tasks' ? (
        /* ========== Async Tasks View ========== */
        tasks.length === 0 ? (
          <div className="text-center py-24 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3">
            <Activity className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              暂无评估任务记录
            </p>
            <p className="text-xs text-slate-400">一对一评估报告生成后，将会在此处展示</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 rounded-2xl shadow-sm p-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold',
                          getTaskStatusClass(task.status),
                        )}
                      >
                        {getTaskStatusLabel(task.status)}
                      </span>
                      <span className="text-xs text-slate-400">#{task.id}</span>
                      {task.retryOfTaskId && (
                        <span className="text-xs text-slate-400">重试自 #{task.retryOfTaskId}</span>
                      )}
                      <span className="text-xs text-slate-400">第 {task.attempt} 次</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100">
                        {task.stage?.name || '未知课程'}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        学员：{task.user?.name || '未知用户'} · 创建：
                        {formatDate(task.createdAt)} · 更新：{formatDate(task.updatedAt)}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{task.message}</p>
                    {task.error && (
                      <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-sm text-rose-700">
                        {task.error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">进度</p>
                      <p className="font-bold text-slate-800 dark:text-slate-100">
                        {task.progress}%
                      </p>
                    </div>
                    {task.status === 'failed' && (
                      <button
                        type="button"
                        disabled={retryingTaskId === task.id}
                        onClick={() => handleRetryTask(task.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-60 transition-colors"
                      >
                        {retryingTaskId === task.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        重新生成
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : /* ========== Courses View ========== */
      courses.length === 0 ? (
        <div className="text-center py-24 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-3">
          <Award className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
            暂无课程学习数据
          </p>
          <p className="text-xs text-slate-400">课程被学员学习后，将会在此处展示</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const isOneOnOne = course.learningMode === 'oneOnOne';
            return (
              <div
                key={course.stageId}
                onClick={() => router.push(`/admin/learning-records/course/${course.stageId}`)}
                className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-emerald-500/20 dark:hover:border-emerald-500/20 transition-all duration-300 cursor-pointer group"
              >
                {/* Top accent */}
                <div
                  className={cn(
                    'absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r',
                    isOneOnOne ? 'from-blue-500 to-indigo-500' : 'from-emerald-500 to-teal-500',
                  )}
                />

                {/* Card Body */}
                <div className="p-5 space-y-4">
                  {/* Course header */}
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md bg-gradient-to-br',
                        isOneOnOne ? 'from-blue-500 to-indigo-500' : 'from-emerald-500 to-teal-500',
                      )}
                    >
                      {isOneOnOne ? <Bot className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-snug line-clamp-2">
                        {course.stageName}
                      </h3>
                      <div className="mt-1.5">
                        {isOneOnOne ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                            <Bot className="w-3 h-3" />
                            一对一对练
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                            <BookOpen className="w-3 h-3" />
                            教学模式
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all mt-1" />
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-slate-100 dark:bg-slate-800/80" />

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <Users className="w-4 h-4 text-violet-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {course.userCount}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">学员数</p>
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <Trophy className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {course.avgScore !== null && course.avgScore > 0 ? course.avgScore : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">均分</p>
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-950/30 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 text-center">
                      <div className="flex items-center justify-center mb-1.5">
                        <Clock className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {formatDate(course.lastActive).slice(5)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">活跃</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
