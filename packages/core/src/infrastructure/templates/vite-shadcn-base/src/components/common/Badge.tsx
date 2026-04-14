import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/format';

export interface BadgeProps {
  /** When set, renders a pill with a number. 99+ for values > 99. */
  count?: number;
  /** When true, renders as a solid dot (no number). */
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'destructive' | 'success' | 'neutral';
}

const variantClasses = {
  primary: 'bg-primary text-primary-foreground',
  destructive: 'bg-rose-500 text-white',
  success: 'bg-emerald-500 text-white',
  neutral: 'bg-slate-700 text-slate-100',
} as const;

/**
 * Notification pill or dot. Use `count` for a number badge, `dot` for
 * a unread-indicator dot, or pass children for arbitrary content.
 */
export function Badge({ count, dot, variant = 'primary', className, children }: BadgeProps) {
  if (dot) {
    return (
      <span
        aria-hidden
        className={cn(
          'ring-background inline-block h-2 w-2 rounded-full ring-2',
          variantClasses[variant],
          className
        )}
      />
    );
  }

  if (typeof count === 'number') {
    const label = count > 99 ? '99+' : formatCompactNumber(count);
    return (
      <span
        className={cn(
          'ring-background inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold ring-2',
          variantClasses[variant],
          className
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
