'use client';

import { useState } from 'react';
import { ToolChip } from './tool-chip';
import { summarizeToolDetail } from './detect';

export interface GenericToolBubbleProps {
  name: string;
  detail: string;
  parsed: Record<string, unknown> | null;
}

/**
 * Collapsed-by-default tool bubble. Clicking the chip expands a
 * pretty-printed view of the tool's payload underneath.
 */
export function GenericToolBubble({ name, detail, parsed }: GenericToolBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = summarizeToolDetail(parsed, detail);
  const body = parsed ? JSON.stringify(parsed, null, 2) : detail;

  return (
    <div className="inline-flex max-w-full flex-col">
      <ToolChip
        name={name}
        summary={expanded ? null : summary}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <pre className="border-border/60 bg-background/40 text-foreground/70 max-h-[300px] max-w-full overflow-auto rounded-md rounded-tl-none border px-3 py-2 font-mono text-[10px] leading-relaxed">
          {body}
        </pre>
      ) : null}
    </div>
  );
}
