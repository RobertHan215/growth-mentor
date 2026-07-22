'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import {
  LayoutDashboard,
  PlusCircle,
  BookOpen,
  Tags,
  FolderTree,
  Users,
  ArrowLeft,
  ShieldAlert,
  Swords,
  ClipboardList,
} from 'lucide-react';

const ADMIN_NAVIGATION = [
  { name: '仪表盘', href: '/admin', icon: LayoutDashboard },
  { name: '生成课程', href: '/admin/generate', icon: PlusCircle },
  { name: '课程管理', href: '/admin/courses', icon: BookOpen },
  { name: '陪练管理', href: '/admin/sparring', icon: Swords },
  { name: '学习记录', href: '/admin/learning-records', icon: ClipboardList },
  { name: '分类管理', href: '/admin/categories', icon: FolderTree },
  { name: '标签管理', href: '/admin/tags', icon: Tags },
  { name: '敏感词管理', href: '/admin/sensitive-words', icon: ShieldAlert },
  { name: '用户管理', href: '/admin/users', icon: Users },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Navbar */}
      <header className="fixed top-0 inset-x-0 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between z-50 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-semibold text-lg">
            {APP_NAME} <span className="text-slate-400 font-normal text-sm ml-2">管理中心</span>
          </span>
        </div>
      </header>

      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Admin Sidebar */}
        <aside className="w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4 px-2">
              管理中心
            </h2>
            <nav className="space-y-1">
              {ADMIN_NAVIGATION.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-4 h-4',
                        isActive ? 'text-red-600 dark:text-red-400' : 'text-slate-400',
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
