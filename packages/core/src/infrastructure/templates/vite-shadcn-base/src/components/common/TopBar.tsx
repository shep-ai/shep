import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './IconButton';

export interface TopBarProps {
  title: string;
  subtitle?: string;
  /** When set, a back-chevron button is rendered on the left. */
  onBack?: () => void;
  /** Optional right-side actions (IconButtons, Badges, etc.). */
  actions?: ReactNode;
  className?: string;
  /** When true, the bar sticks to the top of its scroll container. */
  sticky?: boolean;
}

/** Screen header with optional back button, title/subtitle, and actions slot. */
export function TopBar({ title, subtitle, onBack, actions, className, sticky }: TopBarProps) {
  return (
    <header
      className={cn(
        'border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/70 flex items-center gap-2 border-b px-4 py-3 backdrop-blur-lg',
        sticky && 'sticky top-0 z-30',
        className
      )}
    >
      {onBack ? (
        <IconButton size="sm" variant="ghost" onClick={onBack} aria-label="Back">
          <ChevronLeft />
        </IconButton>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-foreground truncate text-base font-semibold">{title}</h1>
        {subtitle ? <p className="text-muted-foreground truncate text-[11px]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
