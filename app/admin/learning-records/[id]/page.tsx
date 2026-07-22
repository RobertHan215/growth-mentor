'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Award,
  ThumbsUp,
  Star,
  Lightbulb,
  CheckCircle,
  MessageCircle,
  UserCheck,
  ChevronDown,
  Sparkles,
  Play,
  Pause,
  Settings,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TrainingReportPanel } from '@/components/training/training-report-modal';
import { ChatHistoryViewer } from '@/components/admin/chat-history-viewer';

interface UserInfo {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
}

interface StageInfo {
  id: string;
  name: string;
  learningMode: string;
  coverImage: string | null;
}

export default function LearningRecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type'); // 'teaching' | 'oneOnOne'

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'report' | 'chat'>('report');

  // Data states
  const [user, setUser] = useState<UserInfo | null>(null);
  const [stage, setStage] = useState<StageInfo | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userCourse, setUserCourse] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [courseSummary, setCourseSummary] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trainingResult, setTrainingResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [oneOnOneChat, setOneOnOneChat] = useState<any>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [reevaluating, setReevaluating] = useState(false);

  // Autoplay states
  const [autoplayActive, setAutoplayActive] = useState(false);
  const [autoplayInterval, setAutoplayInterval] = useState(1.0); // 默认 1 秒
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [showPlaySettings, setShowPlaySettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0); // 播放倍速，默认 1.0x

  useEffect(() => {
    // 展开的课堂互动会话改变时，打断自动播放
    setAutoplayActive(false);
  }, [expandedSessionId]);

  useEffect(() => {
    if (!type) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/learning-records/${id}?type=${type}`);
        const data = await res.json();

        if (res.ok) {
          setUser(data.user ?? null);
          setStage(data.stage ?? null);
          if (type === 'teaching') {
            const sessions = data.chatSessions ?? [];
            setUserCourse(data.userCourse ?? null);
            setCourseSummary(data.courseSummary ?? null);
            setChatSessions(sessions);
            if (sessions.length > 0) {
              setExpandedSessionId(sessions[0].id);
            }
          } else {
            setTrainingResult(data.trainingResult ?? null);
            setOneOnOneChat(data.chatSession ?? null);
          }
        } else {
          toast.error(data.error || '获取记录详情失败');
        }
      } catch (err) {
        console.error('Failed to fetch detail:', err);
        toast.error('网络请求失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id, type]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  const pollJobStatus = (jobId: string, toastId: string | number) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/evaluate-jobs/${jobId}`);
        if (res.ok) {
          const job = await res.json();
          if (job.status === 'completed') {
            clearInterval(interval);
            toast.success('重新评估完成！数据已更新', { id: toastId });
            window.location.reload();
            setReevaluating(false);
          } else if (job.status === 'failed') {
            clearInterval(interval);
            toast.error(job.message || '评估任务失败', { id: toastId });
            setReevaluating(false);
          }
        } else {
          clearInterval(interval);
          toast.error('获取评估状态失败', { id: toastId });
          setReevaluating(false);
        }
      } catch {
        clearInterval(interval);
        setReevaluating(false);
      }
    }, 2000);
  };

  const handleReevaluate = async () => {
    const sessionId = oneOnOneChat?.id || trainingResult?.sessionId;
    if (!sessionId || reevaluating) return;

    setReevaluating(true);
    const toastId = toast.loading('正在创建重新评估任务...');
    try {
      const res = await fetch(`/api/training/history/${sessionId}/reevaluate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '创建评估任务失败');
      }

      toast.loading('任务已创建，后台评估中，请稍候...', { id: toastId });
      pollJobStatus(data.jobId, toastId);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : '重新评估失败';
      toast.error(message, { id: toastId });
      setReevaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <p className="text-sm">加载详情中...</p>
      </div>
    );
  }

  if (!user || !stage) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-slate-500">未找到相关学习记录或数据已失效</p>
        <Button onClick={() => router.back()} variant="outline">
          返回上一页
        </Button>
      </div>
    );
  }

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
            学员学习档案
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">多维度评估学员对练分数、课堂聊天及学习表现反馈</p>
        </div>
      </div>

      {/* Profile Overview Card (Vibrant glassmorphic style) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent dark:from-red-950/20 dark:via-orange-950/10 dark:to-transparent border border-white/20 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl" />
        
        {/* Left Part: User avatar & details */}
        <div className="flex items-center gap-5 md:w-1/3">
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0 text-xl font-bold overflow-hidden shadow-md ring-4 ring-red-500/10">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">
              {user.name}
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
              {user.email || '暂无邮箱'}
            </p>
          </div>
        </div>

        {/* Middle Part: Stage/Course Info */}
        <div className="flex items-center gap-4 md:w-1/3 md:border-l border-slate-200/50 dark:border-slate-800/50 md:pl-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-md">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {stage.name}
            </h3>
            <div className="mt-1">
              {type === 'oneOnOne' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                  <Bot className="w-3.5 h-3.5" /> 一对一陪练
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                  <BookOpen className="w-3.5 h-3.5" /> 教学模式
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Part: Metrics statistics */}
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 md:w-1/3 md:border-l border-slate-200/50 dark:border-slate-800/50 md:pl-8">
          {type === 'oneOnOne' && trainingResult ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/40 dark:bg-slate-900/40 p-2 rounded-lg border border-white/20 dark:border-slate-800">
                <p className="text-[10px] text-slate-400">对练得分</p>
                <p className="text-base font-extrabold text-red-500 mt-0.5">{trainingResult.totalScore}分</p>
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 p-2 rounded-lg border border-white/20 dark:border-slate-800">
                <p className="text-[10px] text-slate-400">时长</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1 truncate">
                  {formatDuration(trainingResult.duration)}
                </p>
              </div>
            </div>
          ) : userCourse ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/40 dark:bg-slate-900/40 p-2 rounded-lg border border-white/20 dark:border-slate-800">
                <p className="text-[10px] text-slate-400">当前状态</p>
                <span className={cn(
                  'inline-block text-xs font-bold mt-1.5',
                  userCourse.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'
                )}>
                  {userCourse.status === 'completed' ? '已结课' : '学习中'}
                </span>
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 p-2 rounded-lg border border-white/20 dark:border-slate-800">
                <p className="text-[10px] text-slate-400">最后活跃</p>
                <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mt-1 truncate">
                  {formatDate(userCourse.updatedAt).split(' ')[0]}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Modern Tabs Bar */}
        <div className="inline-flex bg-slate-100/80 dark:bg-slate-800/40 p-1 rounded-2xl border border-slate-200/20 dark:border-slate-700/20 shadow-sm shrink-0">
          <button
            onClick={() => setActiveTab('report')}
            className={cn(
              'px-5 py-2 text-xs font-bold rounded-xl transition-all',
              activeTab === 'report'
                ? 'bg-white dark:bg-slate-900 text-red-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            {type === 'oneOnOne' ? '评估报告' : '学习总结 & 结课报告'}
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'px-5 py-2 text-xs font-bold rounded-xl transition-all',
              activeTab === 'chat'
                ? 'bg-white dark:bg-slate-900 text-red-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            聊天记录
          </button>
        </div>

        {/* Autoplay Controls (Only visible when activeTab is 'chat') */}
        {activeTab === 'chat' && (
          <div className="relative flex items-center gap-3 bg-slate-100/80 dark:bg-slate-800/40 p-1 rounded-2xl border border-slate-200/20 dark:border-slate-700/20 shadow-sm shrink-0">
            {/* 播放控制按钮 */}
            <Button
              onClick={() => {
                if (type === 'teaching' && !expandedSessionId) {
                  toast.error('请先展开下方的一个聊天会话');
                  return;
                }
                setAutoplayActive(!autoplayActive);
              }}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all",
                autoplayActive 
                  ? "bg-red-500 text-white hover:bg-red-600 hover:text-white shadow-md shadow-red-500/20 animate-pulse"
                  : "text-slate-600 dark:text-slate-350 hover:bg-white dark:hover:bg-slate-900"
              )}
            >
              {autoplayActive ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>暂停播放</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>依次播放</span>
                </>
              )}
            </Button>

            {/* 播放设置按钮 */}
            <Button
              onClick={() => setShowPlaySettings(!showPlaySettings)}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-xl transition-all",
                showPlaySettings 
                  ? "bg-white dark:bg-slate-900 text-red-500 shadow-sm"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>

            {/* 设置浮动小面板 */}
            {showPlaySettings && (
              <div className="absolute right-0 top-11 z-50 w-64 p-4 bg-white dark:bg-slate-950 border border-slate-200/85 dark:border-slate-800 rounded-2xl shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-250">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/80">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-red-500" />
                    依次播放设置
                  </h4>
                  <button 
                    onClick={() => setShowPlaySettings(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    关闭
                  </button>
                </div>
                
                {/* 话语间隔配置 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span>话语间隔节奏</span>
                    <span className="text-red-500">{autoplayInterval} 秒</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="0.5"
                    value={autoplayInterval}
                    onChange={(e) => setAutoplayInterval(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between text-[8px] text-slate-400 px-0.5">
                    <span>无间隔</span>
                    <span>1s</span>
                    <span>2s</span>
                    <span>3s</span>
                    <span>4s</span>
                  </div>
                </div>

                {/* 播放倍速配置 */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span>播放倍速</span>
                    <span className="text-red-500 font-extrabold">{playbackRate}x</span>
                  </div>
                  <div className="flex gap-1">
                    {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setPlaybackRate(rate)}
                        className={cn(
                          "flex-1 py-1 rounded-lg text-[10px] font-extrabold transition-all border",
                          playbackRate === rate
                            ? "bg-red-500 text-white border-red-500 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自动滚动开关 */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">自动滚动并聚焦</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoScrollEnabled}
                      onChange={(e) => setAutoScrollEnabled(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-7 h-4 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-slate-600 peer-checked:bg-red-500"></div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab Contents Frame (Vibrant Glassmorphism box) */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-white/20 dark:border-slate-800/80 rounded-2xl shadow-sm p-6 md:p-8">
        {type === 'oneOnOne' ? (
          /* ==================== OneOnOne Layout ==================== */
          activeTab === 'report' ? (
            trainingResult ? (
              <div className="max-w-4xl mx-auto space-y-4">
                <div className="flex justify-end">
                  <Button
                    disabled={reevaluating}
                    onClick={handleReevaluate}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/20"
                  >
                    {reevaluating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        重新评估中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                        重新评估（采用最新评分配置）
                      </>
                    )}
                  </Button>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-150 dark:border-slate-800 shadow-sm bg-slate-50/20 dark:bg-slate-950/20">
                  <TrainingReportPanel report={trainingResult} />
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-400 py-12 text-sm">暂无评估报告数据</p>
            )
          ) : oneOnOneChat ? (
            <div className="max-w-3xl mx-auto">
              <ChatHistoryViewer 
                messages={oneOnOneChat.messages} 
                autoplayActive={autoplayActive}
                autoplayInterval={autoplayInterval}
                autoScrollEnabled={autoScrollEnabled}
                playbackRate={playbackRate}
                onAutoplayFinished={() => setAutoplayActive(false)}
              />
            </div>
          ) : (
            <p className="text-center text-slate-400 py-12 text-sm">未关联聊天对话记录</p>
          )
        ) : (
          /* ==================== Teaching Layout ==================== */
          activeTab === 'report' ? (
            courseSummary ? (
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Header Summary */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-red-500 to-orange-400 text-white shadow-md mb-1.5">
                    <Award className="w-6 h-6 animate-bounce" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">个性化结课总结报告</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">依据该学员的提问、日常场景讨论与各项对练数据总结</p>
                </div>

                {/* Grid summary metrics layout */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Rating */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-200/30 dark:border-slate-700/30 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 shrink-0 shadow-sm">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">综合评级</p>
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                        {courseSummary.assessment?.overallLevel === 'advanced' ? '表现优异' : courseSummary.assessment?.overallLevel === 'intermediate' ? '稳步提升中' : '努力学习中'}
                      </p>
                    </div>
                  </div>

                  {/* Asked counts */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-200/30 dark:border-slate-700/30 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500 shrink-0 shadow-sm">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">提问次数</p>
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                        {courseSummary.stats?.questionsAsked ?? 0} 次
                      </p>
                    </div>
                  </div>

                  {/* Discussion count */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-200/30 dark:border-slate-700/30 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-500 shrink-0 shadow-sm">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">参与讨论</p>
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                        {courseSummary.stats?.discussionsJoined ?? 0} 次
                      </p>
                    </div>
                  </div>

                  {/* Training count */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-200/30 dark:border-slate-700/30 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">陪练次数</p>
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                        {courseSummary.stats?.trainingSessions ?? 0} 次
                      </p>
                    </div>
                  </div>
                </div>

                {/* Strengths & Improvements Modular grids */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Strengths */}
                  <div className="bg-emerald-50/10 dark:bg-emerald-950/10 p-5 rounded-2xl border border-emerald-200/20 dark:border-emerald-800/20 shadow-sm hover:shadow transition-shadow">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                      <ThumbsUp className="w-4 h-4 text-emerald-500" />
                      优势与能力亮点
                    </h3>
                    <ul className="space-y-2.5">
                      {courseSummary.assessment?.strengths?.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5 shadow-sm shadow-emerald-500" />
                          <span>{item}</span>
                        </li>
                      )) || <p className="text-xs text-slate-400">暂无数据</p>}
                    </ul>
                  </div>

                  {/* Improvements */}
                  <div className="bg-amber-50/10 dark:bg-amber-950/10 p-5 rounded-2xl border border-amber-200/20 dark:border-amber-800/20 shadow-sm hover:shadow transition-shadow">
                    <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                      <Star className="w-4 h-4 text-amber-500" />
                      待提升与改进项
                    </h3>
                    <ul className="space-y-2.5">
                      {courseSummary.assessment?.improvements?.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5 shadow-sm shadow-amber-500" />
                          <span>{item}</span>
                        </li>
                      )) || <p className="text-xs text-slate-400">暂无数据</p>}
                    </ul>
                  </div>
                </div>

                {/* Advice blocks */}
                <div className="space-y-5">
                  {/* Insights card */}
                  <div className="p-6 rounded-2xl border border-slate-200/40 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/30">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      课程核心感悟
                    </h3>
                    <ul className="space-y-3">
                      {courseSummary.assessment?.keyInsights?.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      )) || <p className="text-xs text-slate-400">暂无感悟记录</p>}
                    </ul>
                  </div>

                  {/* Personalized advice Card */}
                  <div className="relative overflow-hidden p-6 rounded-2xl border border-rose-200/30 dark:border-rose-950/20 bg-rose-50/10 dark:bg-rose-950/10">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl animate-pulse" />
                    <h3 className="text-xs font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4" />
                      导师个性化建议
                    </h3>
                    <p className="text-xs text-rose-700 dark:text-rose-450 leading-relaxed font-semibold">
                      {courseSummary.assessment?.personalizedAdvice || '暂无评价记录。'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-24 bg-slate-50/30 dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                <Trophy className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">暂无结课报告生成</p>
                <p className="text-xs text-slate-400">学完全部教学内容并在末页点击后，即可产出学习报告。</p>
              </div>
            )
          ) : chatSessions.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">该课件下暂无提问或讨论记录</p>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="flex items-center justify-between pb-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider">
                  课堂互动会话 ({chatSessions.length})
                </h3>
              </div>

              {chatSessions.map((session) => {
                const isExpanded = expandedSessionId === session.id;
                return (
                  <div
                    key={session.id}
                    className="border border-slate-200/50 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900"
                  >
                    {/* Collapsible header */}
                    <button
                      onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-slate-800/20 text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 shrink-0 shadow-sm">
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {session.title || '课堂会话'}
                          </h4>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500">
                            类型: {session.type === 'qa' ? '课堂提问' : session.type === 'discussion' ? '场景讨论' : '课件讲授'} · {formatDate(session.createdAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronDown className={cn(
                        'w-4 h-4 text-slate-400 transition-transform duration-200',
                        isExpanded && 'rotate-180 text-red-500'
                      )} />
                    </button>

                    {/* Chat session messages list */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4">
                        <ChatHistoryViewer 
                          messages={session.messages} 
                          autoplayActive={autoplayActive && expandedSessionId === session.id}
                          autoplayInterval={autoplayInterval}
                          autoScrollEnabled={autoScrollEnabled}
                          playbackRate={playbackRate}
                          onAutoplayFinished={() => setAutoplayActive(false)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
