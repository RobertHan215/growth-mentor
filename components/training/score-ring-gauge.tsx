'use client';

import { cn } from '@/lib/utils';

interface ScoreRingGaugeProps {
  readonly score: number;
  readonly maxScore?: number;
  /** Outer diameter in px */
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
  /** Show label text under the score */
  readonly label?: string;
}

function getScoreColor(pct: number): { stroke: string; text: string; glow: string } {
  if (pct >= 80) return { stroke: '#22c55e', text: 'text-green-500', glow: 'rgba(34,197,94,0.25)' };
  if (pct >= 60) return { stroke: '#f59e0b', text: 'text-amber-500', glow: 'rgba(245,158,11,0.25)' };
  return { stroke: '#ef4444', text: 'text-red-500', glow: 'rgba(239,68,68,0.25)' };
}

export function ScoreRingGauge({
  score,
  maxScore = 100,
  size = 120,
  strokeWidth = 8,
  className,
  label,
}: ScoreRingGaugeProps) {
  const pct = maxScore > 0 ? Math.min(Math.max(Math.round((score / maxScore) * 100), 0), 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * pct) / 100;
  const center = size / 2;
  const colors = getScoreColor(pct);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700/60"
        />
        {/* Glow filter */}
        <defs>
          <filter id="score-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Score arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter="url(#score-glow)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-bold tabular-nums leading-none', colors.text)} style={{ fontSize: size * 0.28 }}>
          {score}
        </span>
        {maxScore !== 100 && (
          <span className="text-gray-400 dark:text-gray-500 mt-0.5" style={{ fontSize: size * 0.11 }}>
            / {maxScore}
          </span>
        )}
        {label && (
          <span className="text-gray-500 dark:text-gray-400 mt-1" style={{ fontSize: size * 0.1 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
