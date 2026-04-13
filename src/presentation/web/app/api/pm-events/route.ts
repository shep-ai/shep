/**
 * SSE API Route: GET /api/pm-events
 *
 * Streams project management entity change events to connected web UI clients
 * via Server-Sent Events (SSE).
 *
 * Uses DB polling with a per-connection cache so only deltas are sent.
 * Requires a ?projectId query parameter to scope events to a single project.
 *
 * - Polls work items, cycles, and modules every 2 seconds
 * - Compares against cached state and emits only changes
 * - Sends heartbeat comments every 30 seconds to keep connection alive
 * - Cleans up intervals on client disconnect
 */

import { resolve } from '@/lib/server-container';
import type { IWorkItemRepository } from '@shepai/core/application/ports/output/repositories/work-item-repository.interface';
import type { ICycleRepository } from '@shepai/core/application/ports/output/repositories/cycle-repository.interface';
import type { IPmModuleRepository } from '@shepai/core/application/ports/output/repositories/pm-module-repository.interface';
import type { WorkItem, Cycle, PmModule } from '@shepai/core/domain/generated/output';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export type PmEventType =
  | 'work_item_created'
  | 'work_item_updated'
  | 'work_item_deleted'
  | 'cycle_created'
  | 'cycle_updated'
  | 'cycle_deleted'
  | 'module_created'
  | 'module_updated'
  | 'module_deleted';

export interface PmEvent {
  eventType: PmEventType;
  entityId: string;
  projectId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface CachedWorkItem {
  id: string;
  stateId: string;
  priority: string | undefined;
  updatedAt: string;
}

interface CachedCycle {
  id: string;
  status: string;
  updatedAt: string;
}

interface CachedModule {
  id: string;
  status: string;
  updatedAt: string;
}

function toWorkItemCache(wi: WorkItem): CachedWorkItem {
  return {
    id: wi.id,
    stateId: wi.stateId,
    priority: wi.priority,
    updatedAt: String(wi.updatedAt),
  };
}

function toCycleCache(c: Cycle): CachedCycle {
  return { id: c.id, status: c.status, updatedAt: String(c.updatedAt) };
}

function toModuleCache(m: PmModule): CachedModule {
  return { id: m.id, status: m.status, updatedAt: String(m.updatedAt) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectIdParam = url.searchParams.get('projectId');

  if (!projectIdParam) {
    return new Response('Missing projectId parameter', { status: 400 });
  }

  const projectId: string = projectIdParam;

  const encoder = new TextEncoder();
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Per-connection cache
      let workItemCache = new Map<string, CachedWorkItem>();
      let cycleCache = new Map<string, CachedCycle>();
      let moduleCache = new Map<string, CachedModule>();
      let initialized = false;

      function emit(event: PmEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: pm_event\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      }

      async function poll() {
        if (closed) return;

        try {
          const workItemRepo = resolve<IWorkItemRepository>('IWorkItemRepository');
          const cycleRepo = resolve<ICycleRepository>('ICycleRepository');
          const moduleRepo = resolve<IPmModuleRepository>('IPmModuleRepository');

          const [workItems, cycles, modules] = await Promise.all([
            workItemRepo.listByProject(projectId),
            cycleRepo.listByProject(projectId),
            moduleRepo.listByProject(projectId),
          ]);

          if (!initialized) {
            // Seed the cache on first poll — no events emitted
            workItemCache = new Map(workItems.map((wi) => [wi.id, toWorkItemCache(wi)]));
            cycleCache = new Map(cycles.map((c) => [c.id, toCycleCache(c)]));
            moduleCache = new Map(modules.map((m) => [m.id, toModuleCache(m)]));
            initialized = true;
            return;
          }

          const now = new Date().toISOString();

          // Detect work item changes
          const currentWorkItemIds = new Set(workItems.map((wi) => wi.id));
          for (const wi of workItems) {
            const cached = workItemCache.get(wi.id);
            if (!cached) {
              emit({ eventType: 'work_item_created', entityId: wi.id, projectId, timestamp: now });
            } else if (String(wi.updatedAt) !== cached.updatedAt) {
              emit({
                eventType: 'work_item_updated',
                entityId: wi.id,
                projectId,
                timestamp: now,
                data: { stateId: wi.stateId, priority: wi.priority },
              });
            }
          }
          for (const [id] of workItemCache) {
            if (!currentWorkItemIds.has(id)) {
              emit({ eventType: 'work_item_deleted', entityId: id, projectId, timestamp: now });
            }
          }
          workItemCache = new Map(workItems.map((wi) => [wi.id, toWorkItemCache(wi)]));

          // Detect cycle changes
          const currentCycleIds = new Set(cycles.map((c) => c.id));
          for (const c of cycles) {
            const cached = cycleCache.get(c.id);
            if (!cached) {
              emit({ eventType: 'cycle_created', entityId: c.id, projectId, timestamp: now });
            } else if (String(c.updatedAt) !== cached.updatedAt) {
              emit({
                eventType: 'cycle_updated',
                entityId: c.id,
                projectId,
                timestamp: now,
                data: { status: c.status },
              });
            }
          }
          for (const [id] of cycleCache) {
            if (!currentCycleIds.has(id)) {
              emit({ eventType: 'cycle_deleted', entityId: id, projectId, timestamp: now });
            }
          }
          cycleCache = new Map(cycles.map((c) => [c.id, toCycleCache(c)]));

          // Detect module changes
          const currentModuleIds = new Set(modules.map((m) => m.id));
          for (const m of modules) {
            const cached = moduleCache.get(m.id);
            if (!cached) {
              emit({ eventType: 'module_created', entityId: m.id, projectId, timestamp: now });
            } else if (String(m.updatedAt) !== cached.updatedAt) {
              emit({
                eventType: 'module_updated',
                entityId: m.id,
                projectId,
                timestamp: now,
                data: { status: m.status },
              });
            }
          }
          for (const [id] of moduleCache) {
            if (!currentModuleIds.has(id)) {
              emit({ eventType: 'module_deleted', entityId: id, projectId, timestamp: now });
            }
          }
          moduleCache = new Map(modules.map((m) => [m.id, toModuleCache(m)]));
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
