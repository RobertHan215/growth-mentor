'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Compass, BookOpenCheck, Swords } from 'lucide-react';
import { APP_NAME, APP_LOGO } from '@/lib/branding';
import { getFirstSlideByStages } from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { deriveLearningMode } from '@/lib/training/course-learning-mode';
import type { Slide } from '@/lib/types/slides';

interface Course {
  id: string;
  name: string;
  description: string;
  learningMode?: 'teaching' | 'oneOnOne';
  directorConfig: { supportedModes?: string[] } | null;
  user: { name: string };
  category: { id: string; name: string } | null;
  stageTags: { tag: { id: string; name: string; color: string } }[];
  updatedAt: string;
  coverImage?: string | null;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'teaching' | 'oneOnOne'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCourses = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '12',
      ...(search ? { search } : {}),
      ...(modeFilter !== 'all' ? { mode: modeFilter } : {}),
    });
    fetch(`/api/discover?${params}`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.data;
        if (Array.isArray(list)) {
          setCourses(list);
          setTotalPages(data.pagination?.totalPages || 1);
          getFirstSlideByStages(list.map((c: Course) => c.id)).then(setThumbnails);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, modeFilter]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="fixed top-0 inset-x-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={APP_LOGO} alt={APP_NAME} className="h-8" />
          <nav className="hidden md:flex ml-6 items-center gap-6">
            <button
              onClick={() => router.push('/discover')}
              className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-500"
            >
              <Compass className="w-4 h-4" /> 发现课堂
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition"
            >
              <BookOpenCheck className="w-4 h-4" /> 我的学习
            </button>
          </nav>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6 max-w-7xl mx-auto">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
            探索全球优质公开课堂
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            {APP_NAME} 聚合了来自全平台的优秀教学设计与互动课件。
          </p>
        </div>

        {/* Mode filter + Search bar */}
        <div className="mb-8 space-y-4">
          {/* Mode filter buttons */}
          <div className="flex items-center gap-2 mx-auto md:mx-0 w-fit">
            <button
              onClick={() => { setModeFilter('all'); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                modeFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => { setModeFilter('teaching'); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                modeFilter === 'teaching'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
              }`}
            >
              <BookOpen className="w-4 h-4" /> 教学模式
            </button>
            <button
              onClick={() => { setModeFilter('oneOnOne'); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                modeFilter === 'oneOnOne'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
              }`}
            >
              <Swords className="w-4 h-4" /> 一对一对练
            </button>
          </div>

          {/* Search bar */}
          <div className="max-w-md mx-auto md:mx-0">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索课堂名称..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full px-4 py-2.5 pl-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-shadow"
              />
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <path strokeWidth="2" strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              {search && (
                <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="animate-pulse bg-slate-200 dark:bg-slate-800 rounded-2xl aspect-[4/3]" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            暂无公开发布的课程。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {courses.map(course => {
              const isOneOnOne = deriveLearningMode(course) === 'oneOnOne';
              return (
                <div
                  key={course.id}
                  onClick={() => router.push(`/classroom/${course.id}`)}
                  className="group cursor-pointer flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative overflow-hidden">
                    {course.coverImage ? (
                      <img
                        src={course.coverImage}
                        alt={course.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : thumbnails[course.id] ? (
                      <ThumbnailSlide
                        slide={thumbnails[course.id]}
                        size={280}
                        viewportSize={thumbnails[course.id].viewportSize ?? 1000}
                        viewportRatio={thumbnails[course.id].viewportRatio ?? 0.5625}
                      />
                    ) : (
                      <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 group-hover:scale-110 transition-transform duration-500" />
                    )}

                    {/* Top-left overlay: category + mode badge */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
                      {course.category && (
                        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur px-2 py-0.5 rounded text-[11px] font-medium text-slate-700 dark:text-slate-300 shadow-sm">
                          {course.category.name}
                        </div>
                      )}
                      {isOneOnOne ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/90 text-white shadow-sm backdrop-blur-sm">
                          ⚔️ 一对一模式
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/90 text-white shadow-sm backdrop-blur-sm">
                          📖 教学模式
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 line-clamp-1 mb-1">
                      {course.name || '未命名课堂'}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3 flex-1">
                      {course.description || '暂无简介'}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs text-slate-400">{course.user?.name || '匿名创作者'}</span>
                      <div className="flex gap-1">
                        {course.stageTags?.slice(0, 2).map(t => (
                          <span
                            key={t.tag.id}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: t.tag.color || '#ccc' }}
                            title={t.tag.name}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
</div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-slate-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
