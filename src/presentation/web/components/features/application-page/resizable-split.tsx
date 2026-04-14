'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const MIN_LEFT_PX = 400;
const MIN_RIGHT_PX = 400;
const INITIAL_LEFT_FRACTION = 0.4;

export interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
}

export function ResizableSplit({ left, right }: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(INITIAL_LEFT_FRACTION);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;
    const x = e.clientX - rect.left;

    const clampedX = Math.max(MIN_LEFT_PX, Math.min(x, totalWidth - MIN_RIGHT_PX));
    setLeftFraction(clampedX / totalWidth);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      {/* Left pane — flush with top bar, no internal header */}
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ flexBasis: `${leftFraction * 100}%`, flexShrink: 0 }}
      >
        {left}
      </div>

      {/* Divider — 1px line, hover thickens for grip */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="group border-border hover:bg-primary/20 relative w-px shrink-0 cursor-col-resize border-l transition-colors"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* 8px wide invisible hit target centered on the 1px line */}
        <span className="absolute inset-y-0 -right-1 -left-1" />
      </div>

      {/* Right pane — flush with top bar, no internal header */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  );
}
