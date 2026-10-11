'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { HTML_FRAME_HEIGHT_MESSAGE, buildSandboxedDocument } from './sandboxed-document';

/** Height before the page reports its own. */
export const HTML_FRAME_MIN_HEIGHT = 120;
/** A page taller than this scrolls inside the frame instead of taking the chat's scroll. */
export const HTML_FRAME_MAX_HEIGHT = 1200;

export interface SandboxedHtmlFrameProps {
  /** Untrusted, self-contained HTML. */
  html: string;
  /** Accessible title of the frame. */
  title: string;
  /** Fit the page's reported height (default). Off: the frame fills its container. */
  autoHeight?: boolean;
  className?: string;
}

function readHeight(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const { type, height } = data as { type?: unknown; height?: unknown };
  if (type !== HTML_FRAME_HEIGHT_MESSAGE || typeof height !== 'number') return null;
  return Number.isFinite(height) ? height : null;
}

/**
 * Agent HTML in an opaque-origin, network-less frame (spec 137). Shared by the
 * chat's HTML preview block and the Markdown ```html preview.
 */
export function SandboxedHtmlFrame({
  html,
  title,
  autoHeight = true,
  className,
}: SandboxedHtmlFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(HTML_FRAME_MIN_HEIGHT);
  const srcDoc = useMemo(() => buildSandboxedDocument(html), [html]);

  useEffect(() => {
    if (!autoHeight) return;
    function onMessage(event: MessageEvent) {
      // Only this frame's page may resize this frame.
      if (event.source !== frameRef.current?.contentWindow) return;
      const reported = readHeight(event.data);
      if (reported === null) return;
      setHeight(Math.min(Math.max(reported, HTML_FRAME_MIN_HEIGHT), HTML_FRAME_MAX_HEIGHT));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [autoHeight]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      // Never allow-same-origin: the opaque origin keeps the page out of the app.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={cn('block w-full border-0 bg-white', className)}
      style={autoHeight ? { height } : undefined}
    />
  );
}
