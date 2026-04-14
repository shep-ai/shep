import { cn } from '@/lib/utils';
import type { OnlineStatus } from '@/types/common';

const colorByStatus: Record<OnlineStatus, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  busy: 'bg-rose-500',
  offline: 'bg-slate-500',
};

export interface StatusDotProps {
  status: OnlineStatus;
  className?: string;
  size?: 'sm' | 'md';
}

/** Compact online / offline / away / busy indicator dot. */
export function StatusDot({ status, className, size = 'md' }: StatusDotProps) {
  return (
    <span
      aria-label={status}
      className={cn(
        'inline-block rounded-full',
        size === 'sm' ? 'h-2 w-2' : 'h-3 w-3',
        colorByStatus[status],
        className
      )}
    />
  );
}
