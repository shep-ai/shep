'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, GitFork, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RepoGroupProps {
  /** Display name for the repository */
  repoName: string;
  /** Total number of features in this repo */
  featureCount: number;
  children: ReactNode;
  /** Whether the group starts expanded (default: true) */
  defaultOpen?: boolean;
  /** Called when the user clicks the + button to add a feature */
  onAddFeature?: () => void;
}

export function RepoGroup({
  repoName,
  featureCount,
  children,
  defaultOpen = true,
  onAddFeature,
}: RepoGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid="repo-group" className="group/repo mb-1">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'text-sidebar-foreground hover:bg-sidebar-accent flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold',
            'transition-colors duration-100'
          )}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              'text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-200',
              !open && '-rotate-90'
            )}
          />
          <GitFork className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{repoName}</span>
          <span
            aria-label={`${featureCount} features`}
            className="bg-sidebar-accent text-sidebar-accent-foreground ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[0.6rem] font-medium tabular-nums"
            role="img"
          >
            {featureCount}
          </span>
        </button>
        {onAddFeature ? (
          <button
            type="button"
            data-testid="repo-add-feature"
            onClick={(e) => {
              e.stopPropagation();
              onAddFeature();
            }}
            className={cn(
              'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent mr-2 shrink-0 rounded-md p-1 opacity-0 transition-all duration-100 group-hover/repo:opacity-100',
              'focus-visible:ring-ring focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none'
            )}
            aria-label={`Add feature to ${repoName}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? <div className="pl-2">{children}</div> : null}
    </div>
  );
}
