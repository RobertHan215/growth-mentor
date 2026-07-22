'use client';

import { cn } from '@/lib/utils';

export interface TimelineWhiteboardEntry {
  id: string;
  type: 'info' | 'data' | 'commitment' | 'formula' | 'note';
  content: string;
  timestamp: number;
  round: number;
}

interface TimelineWhiteboardProps {
  readonly entries: TimelineWhiteboardEntry[];
  readonly roleName?: string;
}

export function TimelineWhiteboard({ entries, roleName }: TimelineWhiteboardProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <PinnedProfileCard entries={entries} roleName={roleName} />

      {entries.filter((entry) => entry.round > 0).length > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          <span className="text-[10px] text-gray-400 font-medium">实时进展</span>
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        </div>
      )}

      {entries
        .filter((entry) => entry.round > 0)
        .map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} />
        ))}
    </div>
  );
}

function PinnedProfileCard({
  entries,
  roleName,
}: {
  readonly entries: TimelineWhiteboardEntry[];
  readonly roleName?: string;
}) {
  const infoEntries = entries.filter((entry) => entry.type === 'info' && entry.round === 0);
  const dataEntries = entries.filter((entry) => entry.type === 'data' && entry.round === 0);

  if (infoEntries.length === 0 && dataEntries.length === 0) return null;

  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200/60 dark:border-blue-800/40 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-blue-100/80 dark:border-blue-800/30">
        <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-[10px]">
          👤
        </div>
        <span className="text-[12px] font-bold text-blue-800 dark:text-blue-300">
          {roleName || 'AI 角色'}
        </span>
        <span className="ml-auto text-[10px] text-blue-400/70">档案</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        {infoEntries.map((entry) => (
          <p
            key={entry.id}
            className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed"
          >
            {entry.content}
          </p>
        ))}
        {dataEntries.map((entry) => (
          <p
            key={entry.id}
            className="text-[12px] font-semibold text-indigo-700 dark:text-indigo-300 leading-relaxed"
          >
            {entry.content}
          </p>
        ))}
      </div>
    </div>
  );
}

function TimelineEntry({ entry }: { readonly entry: TimelineWhiteboardEntry }) {
  const isCommitment = entry.type === 'commitment';
  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.note;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 border-l-2 pl-3 py-2 rounded-r-lg transition-colors',
        cfg.border,
        cfg.bg,
        isCommitment &&
          'pr-2 rounded-lg border border-emerald-200/60 dark:border-emerald-800/30 border-l-2',
      )}
    >
      <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
        <span className="text-[13px] leading-none">{cfg.icon}</span>
        {entry.round > 0 && (
          <span
            className={cn(
              'text-[9px] font-bold leading-none',
              isCommitment ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400',
            )}
          >
            R{entry.round}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-[13px] leading-relaxed',
            cfg.text,
            isCommitment && 'font-medium',
          )}
        >
          {entry.content}
        </p>
      </div>
    </div>
  );
}

const TYPE_CONFIG: Record<
  TimelineWhiteboardEntry['type'],
  {
    icon: string;
    border: string;
    bg: string;
    text: string;
  }
> = {
  data: {
    icon: '📊',
    border: 'border-l-purple-400',
    bg: '',
    text: 'text-gray-700 dark:text-gray-300',
  },
  formula: {
    icon: '📋',
    border: 'border-l-amber-400',
    bg: '',
    text: 'text-gray-700 dark:text-gray-300',
  },
  commitment: {
    icon: '✅',
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
    text: 'text-emerald-800 dark:text-emerald-200',
  },
  note: {
    icon: '💡',
    border: 'border-l-gray-300',
    bg: '',
    text: 'text-gray-600 dark:text-gray-400',
  },
  info: {
    icon: '👤',
    border: 'border-l-blue-400',
    bg: '',
    text: 'text-gray-700 dark:text-gray-300',
  },
};
