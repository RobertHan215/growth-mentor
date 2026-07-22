'use client';

import { useRouter } from 'next/navigation';
import { APP_NAME } from '@/lib/branding';
import { PlusCircle, BookOpen, FolderTree, Tags, Users, ArrowRight } from 'lucide-react';

const QUICK_ACTIONS = [
  {
    title: '生成课程',
    desc: '使用 AI 智能生成全新的交互式课件',
    href: '/admin/generate',
    icon: PlusCircle,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
  },
  {
    title: '课程管理',
    desc: '管理所有课程的发布状态、分类和标签',
    href: '/admin/courses',
    icon: BookOpen,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    ring: 'ring-blue-200 dark:ring-blue-800',
  },
  {
    title: '分类管理',
    desc: '维护课程分类体系，组织知识结构',
    href: '/admin/categories',
    icon: FolderTree,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    ring: 'ring-amber-200 dark:ring-amber-800',
  },
  {
    title: '标签管理',
    desc: '创建和管理课程标签，方便内容检索',
    href: '/admin/tags',
    icon: Tags,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    ring: 'ring-purple-200 dark:ring-purple-800',
  },
  {
    title: '用户管理',
    desc: '添加新用户账号、分配角色权限',
    href: '/admin/users',
    icon: Users,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    ring: 'ring-rose-200 dark:ring-rose-800',
  },
];

export default function AdminDashboard() {
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">管理仪表盘</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        欢迎来到 {APP_NAME}{' '}
        管理后台。在这里，您可以生成新课程、管理课程设置，以及维护分类和标签系统。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.href}
            onClick={() => router.push(action.href)}
            className={`group flex items-start gap-4 p-5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left ring-1 ring-transparent hover:${action.ring}`}
          >
            <div
              className={`w-10 h-10 rounded-lg ${action.bg} flex items-center justify-center shrink-0`}
            >
              <action.icon className={`w-5 h-5 ${action.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">{action.title}</h3>
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{action.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
