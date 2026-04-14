import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface BottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}

/** Mobile bottom navigation bar. Sits fixed to the viewport bottom. */
export function BottomNav({ items, activeKey, onSelect, className }: BottomNavProps) {
  return (
    <nav
      className={cn(
        'border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t px-2 py-2 backdrop-blur-lg',
        className
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              'relative flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
            {item.badge ? (
              <span className="absolute top-0 right-2 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] leading-none font-semibold text-white">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
