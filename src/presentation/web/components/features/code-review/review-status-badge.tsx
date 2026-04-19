'use client';

import { cn } from '@/lib/utils';
import { CodeReviewStatus } from '@shepai/core/domain/generated/output';

interface ReviewStatusBadgeProps {
  status: CodeReviewStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  CodeReviewStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  [CodeReviewStatus.Pending]: {
    label: 'Pending',
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400',
  },
  [CodeReviewStatus.InProgress]: {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pulse: true,
  },
  [CodeReviewStatus.Completed]: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  [CodeReviewStatus.Posted]: {
    label: 'Posted',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  [CodeReviewStatus.Failed]: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

export function ReviewStatusBadge({ status, className }: ReviewStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
        config.pulse && 'animate-pulse',
        className
      )}
    >
      {config.label}
    </span>
  );
}
