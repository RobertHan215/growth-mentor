'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquareText, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { name: '陪练配置', href: '/admin/sparring/config', icon: Settings2 },
  { name: '真实话术库', href: '/admin/sparring/speech-library', icon: MessageSquareText },
];

export default function SparringManagementLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">陪练管理</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          管理一对一陪练的全局配置、角色模板和评分配置
        </p>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
