'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  NegotiationChipKind,
  NegotiationTableBoardState,
  NegotiationTableChip,
} from '@/lib/training/negotiation-table-whiteboard';

interface NegotiationTableWhiteboardProps {
  readonly state: NegotiationTableBoardState;
}

const CHIP_CONFIG: Record<
  NegotiationChipKind,
  {
    label: string;
    className: string;
    positionClassName: string;
    emptyText: string;
  }
> = {
  risk: {
    label: '异议',
    className: 'from-red-500 to-red-700 shadow-red-500/20',
    positionClassName: 'left-3 top-[40%]',
    emptyText: '等待异议',
  },
  fact: {
    label: '事实',
    className: 'from-blue-500 to-blue-700 shadow-blue-500/20',
    positionClassName: 'right-3 top-[40%]',
    emptyText: '等待事实',
  },
  plan: {
    label: '方案',
    className: 'from-amber-500 to-orange-700 shadow-amber-500/20',
    positionClassName: 'left-[12%] bottom-[26%]',
    emptyText: '等待方案',
  },
  commitment: {
    label: '承诺',
    className: 'from-emerald-500 to-emerald-700 shadow-emerald-500/20',
    positionClassName: 'right-[12%] bottom-[26%]',
    emptyText: '等待承诺',
  },
};

const CHIP_ORDER: NegotiationChipKind[] = ['risk', 'fact', 'plan', 'commitment'];

export function NegotiationTableWhiteboard({ state }: NegotiationTableWhiteboardProps) {
  const latestChips = useMemo(() => latestChipByKind(state.chips), [state.chips]);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const selectedChip = state.chips.find((chip) => chip.id === selectedChipId) ?? null;

  return (
    <div className="h-full min-h-[320px] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-red-950/10 p-3">
      <div className="relative h-full overflow-hidden rounded-3xl border border-slate-200/80 dark:border-gray-800 bg-white/85 dark:bg-gray-900/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <TopInfoStrip state={state} />

        <div className="absolute inset-x-3 top-[84px] bottom-[78px]">
          <div className="relative mx-auto h-full max-w-[620px] min-h-[180px] rounded-[2rem] border border-slate-300/70 dark:border-gray-700 bg-gradient-to-br from-white to-slate-100 dark:from-gray-900 dark:to-gray-800 shadow-[inset_0_0_0_10px_rgba(255,255,255,0.55),0_24px_70px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_0_0_10px_rgba(255,255,255,0.03),0_24px_70px_rgba(0,0,0,0.34)]">
            <div className="absolute inset-[52px_72px] rounded-[1.75rem] border border-dashed border-slate-300/80 dark:border-gray-600 bg-white/45 dark:bg-white/[0.03]" />

            <SeatLabel
              className="top-3"
              title="对练对象"
              text={state.profile.attitude}
            />
            <SeatLabel
              className="bottom-3"
              title="练习者"
              text="推进对话，补齐承诺"
            />

            {CHIP_ORDER.map((kind) => {
              const chip = latestChips[kind];
              return (
                <TableChip
                  key={kind}
                  kind={kind}
                  chip={chip}
                  selected={chip?.id === selectedChipId}
                  onSelect={() => setSelectedChipId(chip?.id ?? null)}
                />
              );
            })}

            <div className="absolute left-1/2 top-1/2 z-20 flex h-[104px] w-[min(220px,44%)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[1.75rem] bg-gray-950 px-4 text-center text-white shadow-2xl dark:bg-black">
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                next move
              </span>
              <b className="mt-2 line-clamp-2 text-base leading-tight">
                {state.currentObjective.title}
              </b>
            </div>
          </div>
        </div>

        {selectedChip && (
          <ChipEvidenceDrawer chip={selectedChip} onClose={() => setSelectedChipId(null)} />
        )}

        <BottomActionRail state={state} />
      </div>
    </div>
  );
}

function TopInfoStrip({ state }: { readonly state: NegotiationTableBoardState }) {
  return (
    <div className="absolute inset-x-3 top-3 z-30 grid h-16 grid-cols-[1.5fr_0.9fr_0.8fr] gap-2">
      <InfoPill label="对象" value={`${state.profile.name} · ${state.profile.summary}`} />
      <InfoPill label="态度" value={state.profile.attitude} />
      <InfoPill label="已捕获" value={`${state.capturedCount} 条线索`} />
    </div>
  );
}

function InfoPill({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/85">
      <span className="block text-[10px] font-medium text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <b className="mt-0.5 block truncate text-xs text-gray-800 dark:text-gray-100">{value}</b>
    </div>
  );
}

function SeatLabel({
  title,
  text,
  className,
}: {
  readonly title: string;
  readonly text: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'absolute left-1/2 z-10 hidden w-[min(220px,48%)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-center text-[11px] shadow-sm dark:border-gray-700 dark:bg-gray-900/90 sm:block',
        className,
      )}
    >
      <b className="block text-gray-800 dark:text-gray-100">{title}</b>
      <span className="block truncate text-gray-500 dark:text-gray-400">{text}</span>
    </div>
  );
}

function TableChip({
  kind,
  chip,
  selected,
  onSelect,
}: {
  readonly kind: NegotiationChipKind;
  readonly chip?: NegotiationTableChip;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const config = CHIP_CONFIG[kind];
  const disabled = !chip;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'absolute z-30 max-w-[32%] rounded-full px-3 py-2 text-left text-[11px] font-bold text-white shadow-lg transition-all',
        config.positionClassName,
        disabled
          ? 'cursor-default bg-slate-300 text-slate-600 shadow-none dark:bg-gray-700 dark:text-gray-400'
          : `bg-gradient-to-br ${config.className} hover:-translate-y-0.5 hover:scale-[1.02]`,
        selected && 'ring-2 ring-gray-950/70 ring-offset-2 dark:ring-white/80 dark:ring-offset-gray-900',
      )}
    >
      <span className="block whitespace-nowrap">{chip?.label ?? config.label}</span>
      <span className="block truncate text-[10px] font-medium opacity-85">
        {chip?.value ?? config.emptyText}
      </span>
    </button>
  );
}

function ChipEvidenceDrawer({
  chip,
  onClose,
}: {
  readonly chip: NegotiationTableChip;
  readonly onClose: () => void;
}) {
  return (
    <div className="absolute right-4 top-[108px] z-40 w-[min(240px,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-2xl backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/95">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <b className="block text-gray-800 dark:text-gray-100">选中：{chip.label}筹码</b>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">R{chip.round}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="关闭证据"
        >
          ×
        </button>
      </div>
      <p className="leading-relaxed text-gray-600 dark:text-gray-300">{chip.value}</p>
      {chip.evidence && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-gray-400 dark:border-gray-800 dark:text-gray-500">
          证据：{chip.evidence}
        </p>
      )}
    </div>
  );
}

function BottomActionRail({ state }: { readonly state: NegotiationTableBoardState }) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-30 grid h-16 grid-cols-[36px_1fr_auto] items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-3 shadow-sm backdrop-blur-md dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-xs font-black text-white shadow-sm">
        {state.currentObjective.round || 1}
      </div>
      <div className="min-w-0">
        <b className="block truncate text-xs text-gray-900 dark:text-gray-100">
          下一步：{state.currentObjective.title}
        </b>
        <span className="mt-0.5 block truncate text-[11px] text-amber-800 dark:text-amber-300">
          {state.currentObjective.rationale}
        </span>
      </div>
      <button
        type="button"
        className="hidden rounded-xl border border-amber-300 bg-white/80 px-3 py-2 text-[11px] font-semibold text-amber-800 shadow-sm transition-colors hover:bg-white dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 sm:block"
      >
        教练提示
      </button>
    </div>
  );
}

function latestChipByKind(chips: NegotiationTableChip[]): Partial<Record<NegotiationChipKind, NegotiationTableChip>> {
  return chips.reduce<Partial<Record<NegotiationChipKind, NegotiationTableChip>>>((acc, chip) => {
    const previous = acc[chip.kind];
    if (!previous || chip.round >= previous.round) {
      acc[chip.kind] = chip;
    }
    return acc;
  }, {});
}
