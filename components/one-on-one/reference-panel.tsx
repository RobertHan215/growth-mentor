'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, BookOpen, MessageSquareText, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeaknessDisplayItem } from '@/lib/types/training-weakness';

export interface ReferenceData {
  keyPoints: { title: string; content: string }[];
  scripts: { situation: string; response: string }[];
  standardAnswers: { question: string; answer: string }[];
}

interface ReferencePanelProps {
  readonly data: ReferenceData | null;
  readonly loading?: boolean;
  readonly courseName?: string;
  readonly weaknesses?: WeaknessDisplayItem[];
  readonly weaknessesLoading?: boolean;
}

function formatSourceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWeaknessSource(source: NonNullable<WeaknessDisplayItem['source']>): string[] {
  const parts: string[] = [];

  if (source.attemptNumber) {
    parts.push(`第 ${source.attemptNumber} 次对练`);
  } else if (source.title) {
    parts.push(source.title);
  } else {
    parts.push('历史对练');
  }

  const dateText = formatSourceDate(source.createdAt);
  if (dateText) parts.push(dateText);
  parts.push(`${source.totalScore}分`);
  if (source.rounds > 0) parts.push(`${source.rounds}轮`);

  return parts;
}

function Section({
  title,
  icon: Icon,
  color,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-100/50 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <Icon className={cn('w-4.5 h-4.5 shrink-0', color)} />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1">{title}</span>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 transition-transform duration-200',
          open && 'rotate-180',
        )} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReferencePanel({ data, loading, courseName, weaknesses, weaknessesLoading }: ReferencePanelProps) {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">正在分析课程内容...</p>
        <p className="text-xs text-gray-300 dark:text-gray-600">提取知识点和参考话术</p>
      </div>
    );
  }

  if (!data && !(weaknesses && weaknesses.length > 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500 px-6">
        <BookOpen className="w-8 h-8 opacity-30" />
        <p className="text-sm text-center">开始对练后将显示参考资料</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-500" />
          参考资料
        </h2>
        {courseName && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{courseName}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
        {/* Historical Weaknesses (注意事项) */}
        {weaknesses && weaknesses.length > 0 && (
          <Section title="本次注意事项" icon={AlertTriangle} color="text-amber-500" defaultOpen={true}>
            {weaknesses.map((w) => (
              <div key={w.id} className="bg-amber-50/50 dark:bg-amber-900/10 rounded-lg p-3 space-y-1.5 border border-amber-200/50 dark:border-amber-800/30">
                <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  {w.name}
                </div>
                {w.source && (
                  <div className="rounded-md border border-amber-200/60 dark:border-amber-800/40 bg-white/50 dark:bg-gray-950/20 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-amber-700/80 dark:text-amber-300/80">
                      来源对话
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      {formatWeaknessSource(w.source).join(' · ')}
                    </p>
                    {w.source.title && w.source.attemptNumber && (
                      <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 truncate">
                        {w.source.title}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-amber-600/80 dark:text-amber-400/70 leading-relaxed">
                  <span className="font-semibold">影响：</span>{w.description}
                </p>
                <div className="text-xs text-amber-500 dark:text-amber-500/60 flex items-start gap-1.5 mt-1">
                  <span className="shrink-0 font-semibold">建议：</span>
                  <span>{w.suggestion}</span>
                </div>
              </div>
            ))}
          </Section>
        )}
        {weaknessesLoading && (!weaknesses || weaknesses.length === 0) && (
          <div className="flex items-center gap-2 text-amber-500/70 text-xs py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>正在加载历史弱项...</span>
          </div>
        )}

        {/* Key Points */}
        {data && data.keyPoints.length > 0 && (
          <Section title="关键知识点" icon={CheckCircle2} color="text-green-500">
            {data.keyPoints.map((kp, i) => (
              <div key={i} className="space-y-1.5">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {kp.title}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed pl-7">
                  {kp.content}
                </p>
              </div>
            ))}
          </Section>
        )}

        {/* Reference Scripts */}
        {data && data.scripts.length > 0 && (
          <Section title="参考话术" icon={MessageSquareText} color="text-blue-500" defaultOpen={true}>
            {data.scripts.map((s, i) => (
              <div key={i} className="bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  💡 {s.situation}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed border-l-2 border-blue-300 dark:border-blue-700 pl-3">
                  &ldquo;{s.response}&rdquo;
                </p>
              </div>
            ))}
          </Section>
        )}

        {/* Standard Answers */}
        {data && data.standardAnswers.length > 0 && (
          <Section title="标准答案" icon={BookOpen} color="text-purple-500" defaultOpen={true}>
            {data.standardAnswers.map((sa, i) => (
              <div key={i} className="space-y-1.5">
                <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  Q: {sa.question}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed bg-purple-50/30 dark:bg-purple-900/10 rounded-lg p-3">
                  {sa.answer}
                </p>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
