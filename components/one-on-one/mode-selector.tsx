'use client';

import { motion } from 'motion/react';
import { BookOpen, Swords, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export type ClassroomMode = 'selecting' | 'teaching' | 'oneOnOne';

interface ModeSelectorProps {
  readonly courseName: string;
  readonly onSelectMode: (mode: 'teaching' | 'oneOnOne') => void;
  /** If provided, only show these modes */
  readonly supportedModes?: ('teaching' | 'oneOnOne')[];
}

const modes = [
  {
    id: 'teaching' as const,
    icon: BookOpen,
    title: '教学模式',
    subtitle: '细致讲解',
    description: '按章节逐页讲解，配合 PPT 动画、讨论和板书，适合系统学习新知识',
    gradient: 'from-blue-500 to-indigo-600',
    hoverGlow: 'hover:shadow-blue-500/20',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    features: ['PPT 动画教学', '多角色讨论', '知识点详解', '课后总结'],
  },
  {
    id: 'oneOnOne' as const,
    icon: Swords,
    title: '一对一对练',
    subtitle: '实战演练',
    description: '基于课程全部内容进行角色扮演对练，附带参考话术和知识点，适合实战提升',
    gradient: 'from-amber-500 to-orange-600',
    hoverGlow: 'hover:shadow-amber-500/20',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    features: ['角色扮演', '参考话术', 'AI 即时评估', '知识点提炼'],
  },
];

export function ModeSelector({ courseName, onSelectMode, supportedModes }: ModeSelectorProps) {
  const router = useRouter();

  // Filter modes to only show supported ones
  const visibleModes = supportedModes && supportedModes.length > 0
    ? modes.filter((m) => supportedModes.includes(m.id))
    : modes;

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/20 to-indigo-200/20 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-amber-200/20 to-orange-200/20 dark:from-amber-900/10 dark:to-orange-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl w-full mx-auto px-6">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          返回课程列表
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            选择学习模式
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {courseName}
          </p>
        </motion.div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleModes.map((mode, i) => (
            <motion.button
              key={mode.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              onClick={() => onSelectMode(mode.id)}
              className={cn(
                'group relative text-left p-6 rounded-2xl border border-gray-200/60 dark:border-gray-700/60',
                'bg-white dark:bg-gray-800/80 backdrop-blur-sm',
                'shadow-sm hover:shadow-xl transition-all duration-300',
                'active:scale-[0.98] cursor-pointer outline-none',
                mode.hoverGlow,
              )}
            >
              {/* Icon */}
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                mode.iconBg,
              )}>
                <mode.icon className={cn('w-6 h-6', mode.iconColor)} />
              </div>

              {/* Title */}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
                {mode.title}
              </h3>
              <p className={cn(
                'text-xs font-semibold mb-3',
                mode.iconColor,
              )}>
                {mode.subtitle}
              </p>

              {/* Description */}
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                {mode.description}
              </p>

              {/* Features */}
              <div className="flex flex-wrap gap-1.5">
                {mode.features.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 rounded-full text-[10px] font-medium"
                  >
                    {f}
                  </span>
                ))}
              </div>

              {/* Hover gradient border */}
              <div className={cn(
                'absolute inset-0 rounded-2xl border-2 border-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                `bg-gradient-to-r ${mode.gradient} [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [mask-composite:exclude] p-[2px]`,
              )} />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
