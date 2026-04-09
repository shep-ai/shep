'use client';

import { useState } from 'react';
import { ChevronLeft, FileText, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileWriteCardProps {
  /** Tool name as it was emitted — "Write", "Edit", "MultiEdit". */
  toolName: string;
  /** Absolute or relative path the agent acted on. */
  filePath: string;
  /** File content (Write) or new_string (Edit). Null if not parseable. */
  content: string | null;
}

/**
 * Specialized bubble for Write/Edit tool events.
 *
 * Collapsed: a pill showing the file icon, basename, and tool verb.
 * Expanded: a full preview panel with a back button that returns to the pill.
 * The preview scrolls internally so long files don't blow up the chat height.
 */
export function FileWriteCard({ toolName, filePath, content }: FileWriteCardProps) {
  const [expanded, setExpanded] = useState(false);

  const basename = filePath.split(/[\\/]/).pop() ?? filePath;
  const lineCount = content ? content.split('\n').length : 0;
  const verb = toolName.toLowerCase();
  const isEdit = /edit/i.test(toolName);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title={filePath}
        className={cn(
          'group inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all',
          isEdit
            ? 'border-sky-500/25 bg-sky-500/10 hover:border-sky-500/40 hover:bg-sky-500/15'
            : 'border-emerald-500/25 bg-emerald-500/10 hover:border-emerald-500/40 hover:bg-emerald-500/15'
        )}
      >
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded',
            isEdit ? 'bg-sky-500/15 text-sky-500' : 'bg-emerald-500/15 text-emerald-500'
          )}
        >
          {isEdit ? <PencilLine className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
        </div>
        <div className="flex min-w-0 flex-col items-start">
          <span className="truncate font-mono text-[11px] font-medium">{basename}</span>
          <span className="text-muted-foreground/70 font-mono text-[9px] tracking-wide uppercase">
            {verb}
            {lineCount ? ` · ${lineCount} line${lineCount === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="border-border/60 bg-background/50 flex max-w-full flex-col overflow-hidden rounded-lg border">
      <div className="bg-muted/60 border-border/60 flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {isEdit ? (
            <PencilLine className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="truncate font-mono text-[11px] font-medium" title={filePath}>
            {basename}
          </span>
          <span className="text-muted-foreground/60 shrink-0 font-mono text-[9px] tracking-wide uppercase">
            {verb}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
          aria-label="Collapse file preview"
        >
          <ChevronLeft className="h-3 w-3" />
          Back
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
        {content ?? '(no content available)'}
      </pre>
      <div className="text-muted-foreground/60 border-border/60 border-t px-3 py-1 font-mono text-[9px]">
        {filePath}
      </div>
    </div>
  );
}
