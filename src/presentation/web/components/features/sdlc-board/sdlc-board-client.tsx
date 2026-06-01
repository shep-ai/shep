'use client';

import { useState, useCallback, useRef } from 'react';
import { KanbanSquare, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SdlcTask, TaskState } from '@shepai/core/domain/generated/output';
import type { SdlcBoardEpic } from '@shepai/core/application/use-cases/sdlc-board/list-sdlc-board.use-case';
import { SdlcBoard } from './sdlc-board';
import { useSdlcEvents } from '@/hooks/use-sdlc-events';
import { listSdlcBoard } from '@/app/actions/list-sdlc-board';
import { updateSdlcTaskStatus } from '@/app/actions/update-sdlc-task-status';

export interface SdlcBoardClientProps {
  initialEpics: SdlcBoardEpic[];
}

export function SdlcBoardClient({ initialEpics }: SdlcBoardClientProps) {
  const [epics, setEpics] = useState<SdlcBoardEpic[]>(initialEpics);

  // Debounce ref for SSE-triggered refetch
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSdlcEvent = useCallback(() => {
    // Debounce: batch rapid events into a single refetch (~300ms)
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(async () => {
      const result = await listSdlcBoard();
      if (result.boardData) {
        setEpics(result.boardData.epics as SdlcBoardEpic[]);
      }
    }, 300);
  }, []);

  const { connectionStatus } = useSdlcEvents({ onEvent: handleSdlcEvent });

  const handleTaskStatusChange = useCallback(async (taskId: string, status: TaskState) => {
    // Optimistic update: move the task to the new status in local state
    setEpics((prev) =>
      prev.map((epic) => ({
        ...epic,
        tasks: epic.tasks.map(({ task, subTasks }) => ({
          task: task.id === taskId ? { ...task, status } : task,
          subTasks,
        })),
      }))
    );

    // Persist via server action; reconcile on error
    const result = await updateSdlcTaskStatus(taskId, status);
    if (result.error) {
      // Reconcile: refetch to get back the true server state
      const fresh = await listSdlcBoard();
      if (fresh.boardData) {
        setEpics(fresh.boardData.epics as SdlcBoardEpic[]);
      }
    }
  }, []);

  const handleCardClick = useCallback((_task: SdlcTask) => {
    // Future: open task detail drawer
  }, []);

  if (epics.length === 0) {
    return (
      <div
        data-testid="sdlc-board-empty"
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <KanbanSquare className="text-muted-foreground/30 mb-3 h-10 w-10" />
        <p className="text-muted-foreground text-sm font-medium">No active agent work yet</p>
        <p className="text-muted-foreground/70 mt-1 text-xs">
          Start a feature to see tasks appear here.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="sdlc-board-client" className="flex h-full flex-col gap-2">
      {/* Live connection indicator */}
      <div className="flex shrink-0 items-center gap-1.5">
        {connectionStatus === 'connected' ? (
          <>
            <Wifi className="h-3 w-3 text-emerald-500" />
            <span className="text-muted-foreground text-[10px]">Live</span>
          </>
        ) : connectionStatus === 'connecting' ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
            <span className="text-muted-foreground text-[10px]">Connecting…</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-rose-500" />
            <span className="text-muted-foreground text-[10px]">Disconnected</span>
          </>
        )}
      </div>

      <SdlcBoard
        epics={epics}
        onTaskStatusChange={handleTaskStatusChange}
        onCardClick={handleCardClick}
        className={cn('flex-1')}
      />
    </div>
  );
}
