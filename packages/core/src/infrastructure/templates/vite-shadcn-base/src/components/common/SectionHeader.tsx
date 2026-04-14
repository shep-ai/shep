import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
  className?: string;
}

/** `<h2>` + optional action (e.g. "See all") for grouping content. */
export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 pt-4 pb-2', className)}>
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      {action ? <div className="text-primary text-xs">{action}</div> : null}
    </div>
  );
}
