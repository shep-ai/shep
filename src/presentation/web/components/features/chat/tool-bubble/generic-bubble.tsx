'use client';

import { useState } from 'react';
import { ToolChip } from './tool-chip';
import { summarizeToolDetail } from './detect';

export interface GenericToolBubbleProps {
  name: string;
  detail: string;
  parsed: Record<string, unknown> | null;
  /**
   * Optional stdout / contents returned by the tool, already
   * unwrapped from its `**Output** \`...\`` persistence envelope.
   * When set, the expanded body shows two labeled sections — INPUT
   * (the tool's arguments) and OUTPUT (the tool's result) — in a
   * single bubble instead of the previous "one bubble per message"
   * layout where every tool call became two stacked cards.
   */
  outputBody?: string | null;
}

/**
 * Collapsed-by-default tool bubble. Clicking the chip expands a
 * pretty-printed view of the tool's input payload and — when a
 * paired Output was captured by the caller — the tool's stdout or
 * contents response in the same card.
 */
export function GenericToolBubble({ name, detail, parsed, outputBody }: GenericToolBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = summarizeToolDetail(parsed, detail);
  const inputBody = parsed ? JSON.stringify(parsed, null, 2) : detail;
  const hasOutput = typeof outputBody === 'string' && outputBody.length > 0;

  return (
    <div className="inline-flex max-w-full flex-col">
      <ToolChip
        name={name}
        summary={expanded ? null : summary}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <div className="border-border/60 bg-background/40 divide-border/40 flex max-w-full flex-col divide-y overflow-hidden rounded-md rounded-tl-none border">
          {/* INPUT — the tool's arguments as parsed JSON or raw detail. */}
          {inputBody ? (
            <section className="flex flex-col">
              {hasOutput ? (
                <span className="text-muted-foreground/70 bg-muted/40 px-3 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                  Input
                </span>
              ) : null}
              {/* No `max-h` / no inner scroll — large payloads flow
                  into the page's natural scroll so the user can see
                  everything by scrolling the thread instead of
                  fighting a nested scrollbar. Long lines wrap via
                  `whitespace-pre-wrap` + `break-words`. */}
              <pre className="text-foreground/70 max-w-full overflow-hidden px-3 py-2 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap">
                {inputBody}
              </pre>
            </section>
          ) : null}
          {/* OUTPUT — the tool's stdout / contents, when the caller
              paired it with an adjacent Output message. */}
          {hasOutput ? (
            <section className="flex flex-col">
              <span className="text-muted-foreground/70 bg-muted/40 px-3 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                Output
              </span>
              <pre className="text-foreground/70 max-w-full overflow-hidden px-3 py-2 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap">
                {outputBody}
              </pre>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
