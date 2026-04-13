'use client';

import { cn } from '@/lib/utils';

export interface GanttBarProps {
  title: string;
  identifier: string;
  startOffset: number;
  widthPercent: number;
  color: string;
  className?: string;
  onClick?: () => void;
}

export function GanttBar({
  title,
  identifier,
  startOffset,
  widthPercent,
  color,
  className,
  onClick,
}: GanttBarProps) {
  return (
    <div
      data-testid={`gantt-bar-${identifier}`}
      className={cn(
        'absolute top-1 flex h-6 cursor-pointer items-center overflow-hidden rounded px-1.5 text-white transition-opacity hover:opacity-90',
        className
      )}
      style={{
        left: `${startOffset}%`,
        width: `${Math.max(widthPercent, 1)}%`,
        backgroundColor: color,
      }}
      onClick={onClick}
      title={`${identifier}: ${title}`}
    >
      <span className="truncate text-[10px] font-medium">{identifier}</span>
    </div>
  );
}
