import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Use this whenever a list, feed, or grid would render zero items.
 * Every screen MUST handle the empty case — never leave a user
 * staring at a blank screen.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border/60 bg-card/40 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-xs">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
