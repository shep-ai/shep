'use client';

/**
 * AppOverflowMenu — the `⋯` menu at the far right of the app top bar.
 *
 * Houses everything that's NOT a primary user action: the destructive
 * Delete, the debug-only "copy generated prompt", and the live session
 * info chip (model + session id) that used to live inline in the top bar.
 * Pulling them in here cleans up the action zone for the SmartDeployButton
 * and Preview while still leaving every control one click away.
 */

import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface AppOverflowMenuProps {
  /** Children rendered inside the dropdown body — typically a stack of
   *  DropdownMenuItems / inline panels for session info / copy prompt. */
  children: React.ReactNode;
  className?: string;
}

export function AppOverflowMenu({ children, className }: AppOverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More options"
          title="More options"
          className={cn(
            // Mirrors AppViewTabs flat-tab visual so the overflow trigger
            // reads as part of the same control row, not a competing
            // affordance. No background pill, no border-radius, no
            // shadow — just a hover/active background shift.
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            'data-[state=open]:bg-background data-[state=open]:text-foreground',
            'data-[state=open]:border-t-primary',
            'relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-none border-t-2 border-t-transparent bg-transparent shadow-none transition-none',
            className
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] font-medium tracking-wide uppercase">
          More options
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
