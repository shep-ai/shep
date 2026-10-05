/** In-memory incident repositories and a fake runtime controller (spec 129). */

import { vi, type Mock } from 'vitest';
import {
  IncidentStatus,
  type Incident,
  type IncidentEvent,
  type RuntimeAction,
} from '@/domain/generated/output.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
  IRuntimeActionRepository,
  IncidentFilter,
} from '@/application/ports/output/repositories/incident-repository.interface.js';
import type { IRuntimeController } from '@/application/ports/output/services/runtime-controller.interface.js';

export class InMemoryIncidents implements IIncidentRepository {
  readonly rows = new Map<string, Incident>();
  async list(filter: IncidentFilter = {}) {
    return [...this.rows.values()]
      .filter((i) => filter.spaceId === undefined || i.spaceId === filter.spaceId)
      .filter((i) => filter.statuses === undefined || filter.statuses.includes(i.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findOpenByExternalId(spaceId: string, externalId: string) {
    return (
      [...this.rows.values()].find(
        (i) =>
          i.spaceId === spaceId &&
          i.externalId === externalId &&
          i.status !== IncidentStatus.Resolved
      ) ?? null
    );
  }
  async create(incident: Incident) {
    this.rows.set(incident.id, incident);
  }
  async update(incident: Incident) {
    this.rows.set(incident.id, incident);
  }
}

export class InMemoryIncidentEvents implements IIncidentEventRepository {
  readonly rows: IncidentEvent[] = [];
  async listByIncident(incidentId: string) {
    return this.rows.filter((e) => e.incidentId === incidentId);
  }
  async append(event: IncidentEvent) {
    this.rows.push(event);
  }
}

export class InMemoryRuntimeActions implements IRuntimeActionRepository {
  readonly rows = new Map<string, RuntimeAction>();
  async listByIncident(incidentId: string) {
    return [...this.rows.values()].filter((a) => a.incidentId === incidentId);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(action: RuntimeAction) {
    this.rows.set(action.id, action);
  }
  async update(action: RuntimeAction) {
    this.rows.set(action.id, action);
  }
}

export type FakeRuntime = IRuntimeController & Record<keyof IRuntimeController, Mock>;

export function fakeRuntime(): FakeRuntime {
  return {
    evidence: vi.fn(async () => ({
      status: 'checkout 1/3 ready',
      events: 'OOMKilled checkout-7d9',
      logs: 'java.lang.OutOfMemoryError',
    })),
    restart: vi.fn(async () => 'deployment.apps/checkout restarted'),
    rollback: vi.fn(async () => 'deployment.apps/checkout rolled back'),
    scale: vi.fn(async () => 'deployment.apps/checkout scaled'),
    verify: vi.fn(async () => ({ recovered: true, detail: 'successfully rolled out' })),
  };
}
