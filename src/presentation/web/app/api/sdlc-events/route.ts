/**
 * SSE API Route: GET /api/sdlc-events
 *
 * Streams SDLC task and sub-task change events to connected web UI clients
 * via Server-Sent Events (SSE).
 *
 * Uses DB polling with a per-connection cache so only deltas are sent.
 * Accepts an optional ?featureId query parameter to scope events to a single
 * feature/epic. Without it, the global SDLC board is streamed (all active tasks).
 *
 * - Polls tasks and sub-tasks every 2 seconds
 * - Compares against cached state and emits only changes
 * - Sends heartbeat comments every 30 seconds to keep connection alive
 * - Cleans up intervals on client disconnect
 */

import { resolve } from '@/lib/server-container';
import type { ISdlcTaskRepository } from '@shepai/core/application/ports/output/repositories/sdlc-task-repository.interface';
import type { ISdlcSubTaskRepository } from '@shepai/core/application/ports/output/repositories/sdlc-subtask-repository.interface';
import type { SdlcTask, SdlcSubTask } from '@shepai/core/domain/generated/output';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export type SdlcEventType =
  | 'sdlc_task_created'
  | 'sdlc_task_updated'
  | 'sdlc_task_deleted'
  | 'sdlc_subtask_created'
  | 'sdlc_subtask_updated'
  | 'sdlc_subtask_deleted';

export interface SdlcEvent {
  eventType: SdlcEventType;
  entityId: string;
  featureId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface CachedSdlcTask {
  id: string;
  featureId: string;
  status: string;
  sortOrder: number;
  updatedAt: string;
}

interface CachedSdlcSubTask {
  id: string;
  taskId: string;
  featureId: string;
  status: string;
  sortOrder: number;
  updatedAt: string;
}

function toTaskCache(t: SdlcTask): CachedSdlcTask {
  return {
    id: t.id,
    featureId: t.featureId,
    status: t.status,
    sortOrder: t.sortOrder,
    updatedAt: String(t.updatedAt),
  };
}

function toSubTaskCache(s: SdlcSubTask): CachedSdlcSubTask {
  return {
    id: s.id,
    taskId: s.taskId,
    featureId: s.featureId,
    status: s.status,
    sortOrder: s.sortOrder,
    updatedAt: String(s.updatedAt),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const featureIdParam = url.searchParams.get('featureId');

  const encoder = new TextEncoder();
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Per-connection cache
      let taskCache = new Map<string, CachedSdlcTask>();
      let subTaskCache = new Map<string, CachedSdlcSubTask>();
      let initialized = false;

      function emit(event: SdlcEvent) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: sdlc_event\ndata: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      }

      async function poll() {
        if (closed) return;

        try {
          const taskRepo = resolve<ISdlcTaskRepository>('ISdlcTaskRepository');
          const subTaskRepo = resolve<ISdlcSubTaskRepository>('ISdlcSubTaskRepository');

          let tasks: SdlcTask[];
          let subTasks: SdlcSubTask[];

          if (featureIdParam) {
            // Scope to a single feature
            [tasks, subTasks] = await Promise.all([
              taskRepo.listByFeature(featureIdParam),
              subTaskRepo.listByFeature(featureIdParam),
            ]);
          } else {
            // Global board: all active tasks; sub-tasks fetched per unique featureId
            tasks = await taskRepo.listAllActive();
            const featureIds = [...new Set(tasks.map((t) => t.featureId))];
            const subTaskArrays = await Promise.all(
              featureIds.map((fid) => subTaskRepo.listByFeature(fid))
            );
            subTasks = subTaskArrays.flat();
          }

          if (!initialized) {
            // Seed the cache on first poll — no events emitted
            taskCache = new Map(tasks.map((t) => [t.id, toTaskCache(t)]));
            subTaskCache = new Map(subTasks.map((s) => [s.id, toSubTaskCache(s)]));
            initialized = true;
            return;
          }

          const now = new Date().toISOString();

          // Detect task changes
          const currentTaskIds = new Set(tasks.map((t) => t.id));
          for (const t of tasks) {
            const cached = taskCache.get(t.id);
            if (!cached) {
              emit({
                eventType: 'sdlc_task_created',
                entityId: t.id,
                featureId: t.featureId,
                timestamp: now,
              });
            } else if (
              String(t.updatedAt) !== cached.updatedAt ||
              t.status !== cached.status ||
              t.sortOrder !== cached.sortOrder
            ) {
              emit({
                eventType: 'sdlc_task_updated',
                entityId: t.id,
                featureId: t.featureId,
                timestamp: now,
                data: { status: t.status, sortOrder: t.sortOrder },
              });
            }
          }
          for (const [id, cached] of taskCache) {
            if (!currentTaskIds.has(id)) {
              emit({
                eventType: 'sdlc_task_deleted',
                entityId: id,
                featureId: cached.featureId,
                timestamp: now,
              });
            }
          }
          taskCache = new Map(tasks.map((t) => [t.id, toTaskCache(t)]));

          // Detect sub-task changes
          const currentSubTaskIds = new Set(subTasks.map((s) => s.id));
          for (const s of subTasks) {
            const cached = subTaskCache.get(s.id);
            if (!cached) {
              emit({
                eventType: 'sdlc_subtask_created',
                entityId: s.id,
                featureId: s.featureId,
                timestamp: now,
                data: { taskId: s.taskId },
              });
            } else if (
              String(s.updatedAt) !== cached.updatedAt ||
              s.status !== cached.status ||
              s.sortOrder !== cached.sortOrder
            ) {
              emit({
                eventType: 'sdlc_subtask_updated',
                entityId: s.id,
                featureId: s.featureId,
                timestamp: now,
                data: { status: s.status, sortOrder: s.sortOrder, taskId: s.taskId },
              });
            }
          }
          for (const [id, cached] of subTaskCache) {
            if (!currentSubTaskIds.has(id)) {
              emit({
                eventType: 'sdlc_subtask_deleted',
                entityId: id,
                featureId: cached.featureId,
                timestamp: now,
                data: { taskId: cached.taskId },
              });
            }
          }
          subTaskCache = new Map(subTasks.map((s) => [s.id, toSubTaskCache(s)]));
        } catch {
          // Swallow poll errors — will retry next interval
        }
      }

      // Start polling
      pollInterval = setInterval(poll, POLL_INTERVAL_MS);
      await poll();

      // Heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Stream closed
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      closed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
  });

  // Clean up on client disconnect
  request.signal.addEventListener('abort', () => {
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
