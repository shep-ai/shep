'use client';

/**
 * AppOverflowMenu — the `⋯` menu at the far right of the app top bar.
 *
 * Houses everything that's NOT a primary user action: the destructive
 * Delete, the debug-only "copy generated prompt", and the live session
 * info chip (model + session id) that used to live inline in the top bar.
 * Pulling them in here cleans up the action zone for the SmartDeployButton
 * and Preview while still leaving every control one click away.
 *
 * Visual: native toolbar icon button. h-8 w-8, rounded-md, borderless,
 * background appears on hover/open. 150ms transitions.
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
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            'active:bg-muted/80',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
            'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-transparent',
            'transition-colors duration-150 ease-out',
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
