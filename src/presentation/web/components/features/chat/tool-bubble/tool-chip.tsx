'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolChipProps {
  name: string;
  summary?: string | null;
  expanded: boolean;
  onToggle: () => void;
  /** Optional icon override. Defaults to a generic wrench. */
  icon?: ReactNode;
  /** Optional accent tint (used for Write/Edit file cards). */
  tint?: 'default' | 'green' | 'blue';
}

const TINT_CLASS: Record<NonNullable<ToolChipProps['tint']>, string> = {
  default: 'bg-muted/40 hover:bg-muted/70',
  green: 'bg-emerald-500/8 hover:bg-emerald-500/15 border-emerald-500/20',
  blue: 'bg-sky-500/8 hover:bg-sky-500/15 border-sky-500/20',
};

/** Compact collapsed-state chip for any tool event. */
export function ToolChip({
  name,
  summary,
  expanded,
  onToggle,
  icon,
  tint = 'default',
}: ToolChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'border-border/60 text-foreground/90 group inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors',
        TINT_CLASS[tint],
        expanded && 'rounded-b-none border-b-0'
      )}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
      )}
      {icon ?? <Wrench className="h-3 w-3 shrink-0 opacity-60" />}
      <span className="shrink-0 font-medium">{name}</span>
      {summary ? (
        <span className="text-muted-foreground/70 max-w-[360px] truncate">{summary}</span>
      ) : null}
    </button>
  );
}
