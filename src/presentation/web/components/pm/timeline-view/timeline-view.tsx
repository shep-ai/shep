'use client';

import { useMemo, useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GanttBar } from './gantt-bar';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

export interface TimelineRelation {
  id: string;
  sourceWorkItemId: string;
  targetWorkItemId: string;
  relationType: string;
}

export interface TimelineViewProps {
  workItems: WorkItem[];
  states: WorkItemState[];
  relations: TimelineRelation[];
  projectPrefix: string;
  onItemClick?: (workItem: WorkItem) => void;
  className?: string;
}

const DAY_MS = 86400000;
const WEEKS_VISIBLE = 6;
const DAYS_VISIBLE = WEEKS_VISIBLE * 7;

const STATE_GROUP_COLORS: Record<string, string> = {
  Backlog: '#a3a3a3',
  Unstarted: '#60a5fa',
  Started: '#fbbf24',
  Completed: '#34d399',
  Cancelled: '#ef4444',
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function TimelineView({
  workItems,
  states,
  relations,
  projectPrefix,
  onItemClick,
  className,
}: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const viewStart = useMemo(() => {
    const today = getMonday(new Date());
    return addDays(today, weekOffset * 7);
  }, [weekOffset]);

  const viewEnd = useMemo(() => addDays(viewStart, DAYS_VISIBLE), [viewStart]);

  const weeks = useMemo(() => {
    const result: { start: Date; label: string }[] = [];
    for (let i = 0; i < WEEKS_VISIBLE; i++) {
      const weekStart = addDays(viewStart, i * 7);
      result.push({ start: weekStart, label: formatDate(weekStart) });
    }
    return result;
  }, [viewStart]);

  const itemsWithDates = useMemo(
    () =>
      workItems.filter(
        (wi) =>
          wi.startDate &&
          wi.dueDate &&
          new Date(wi.dueDate) >= viewStart &&
          new Date(wi.startDate) <= viewEnd
      ),
    [workItems, viewStart, viewEnd]
  );

  const blockingRelations = useMemo(
    () => relations.filter((r) => r.relationType === 'Blocking'),
    [relations]
  );

  const getBarPosition = useCallback(
    (item: WorkItem) => {
      if (!item.startDate || !item.dueDate) return null;
      const start = new Date(item.startDate);
      const end = new Date(item.dueDate);
      const viewStartMs = viewStart.getTime();
      const totalMs = DAYS_VISIBLE * DAY_MS;

      const startOffset = Math.max(0, ((start.getTime() - viewStartMs) / totalMs) * 100);
      const endOffset = Math.min(100, ((end.getTime() - viewStartMs) / totalMs) * 100);
      const width = endOffset - startOffset;

      return { startOffset, widthPercent: width };
    },
    [viewStart]
  );

  const itemIdSet = useMemo(() => new Set(itemsWithDates.map((wi) => wi.id)), [itemsWithDates]);

  const visibleBlockingLines = useMemo(
    () =>
      blockingRelations.filter(
        (r) => itemIdSet.has(r.sourceWorkItemId) && itemIdSet.has(r.targetWorkItemId)
      ),
    [blockingRelations, itemIdSet]
  );

  const handlePrev = useCallback(() => setWeekOffset((o) => o - 2), []);
  const handleNext = useCallback(() => setWeekOffset((o) => o + 2), []);
  const handleToday = useCallback(() => setWeekOffset(0), []);

  if (workItems.length === 0) {
    return (
      <div
        data-testid="timeline-view-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-xs">No work items to display on the timeline.</p>
      </div>
    );
  }

  return (
    <div data-testid="timeline-view" className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={handlePrev}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={handleToday}
          >
            Today
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={handleNext}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <span className="text-muted-foreground text-[10px]">
          {formatDate(viewStart)} – {formatDate(addDays(viewEnd, -1))}
        </span>
      </div>

      <div ref={containerRef} className="overflow-x-auto rounded-lg border">
        <div className="min-w-[800px]">
          {/* Week headers */}
          <div className="bg-muted/50 flex border-b">
            <div className="w-[180px] shrink-0 border-r px-2 py-1">
              <span className="text-[10px] font-medium">Work Item</span>
            </div>
            <div className="flex flex-1">
              {weeks.map((week) => (
                <div
                  key={week.label}
                  className="flex-1 border-r px-2 py-1 text-center last:border-r-0"
                >
                  <span className="text-muted-foreground text-[10px]">{week.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Item rows */}
          {itemsWithDates.map((item) => {
            const pos = getBarPosition(item);
            const state = stateMap.get(item.stateId);
            const color = STATE_GROUP_COLORS[state?.stateGroup ?? 'Backlog'] ?? '#a3a3a3';
            const identifier = `${projectPrefix}-${item.sequenceId}`;

            return (
              <div key={item.id} className="flex border-b last:border-b-0">
                <div className="w-[180px] shrink-0 border-r px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-[10px]">{identifier}</span>
                    <span className="max-w-[120px] truncate text-[10px]">{item.title}</span>
                  </div>
                </div>
                <div className="relative flex-1" style={{ height: 32 }}>
                  {/* Week grid lines */}
                  {weeks.map((week, weekIdx) => (
                    <div
                      key={week.label}
                      className="border-r-border/30 absolute top-0 h-full border-r"
                      style={{ left: `${((weekIdx + 1) / WEEKS_VISIBLE) * 100}%` }}
                    />
                  ))}
                  {pos ? (
                    <GanttBar
                      title={item.title}
                      identifier={identifier}
                      startOffset={pos.startOffset}
                      widthPercent={pos.widthPercent}
                      color={color}
                      onClick={() => onItemClick?.(item)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Dependency indicator */}
          {visibleBlockingLines.length > 0 && (
            <div className="bg-muted/30 border-t px-3 py-1.5">
              <span className="text-muted-foreground text-[10px]">
                {visibleBlockingLines.length} blocking{' '}
                {visibleBlockingLines.length === 1 ? 'dependency' : 'dependencies'} visible
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
