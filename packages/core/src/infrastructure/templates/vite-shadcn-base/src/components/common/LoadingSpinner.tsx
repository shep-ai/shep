import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeClass = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' } as const;

/** Inline or full-page loading indicator. */
export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('text-muted-foreground inline-flex items-center gap-2', className)}
    >
      <Loader2 className={cn('animate-spin', sizeClass[size])} />
      {label ? <span className="text-xs">{label}</span> : null}
    </div>
  );
}
