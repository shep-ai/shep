/** Incident, timeline and runtime action repositories (output ports) — spec 129. */

import type {
  Incident,
  IncidentEvent,
  IncidentStatus,
  RuntimeAction,
} from '../../../../domain/generated/output.js';

export interface IncidentFilter {
  spaceId?: string;
  statuses?: readonly IncidentStatus[];
}

export interface IIncidentRepository {
  /** Newest first. */
  list(filter?: IncidentFilter): Promise<Incident[]>;
  findById(id: string): Promise<Incident | null>;
  /** The space's unresolved incident opened from `externalId`, if any. */
  findOpenByExternalId(spaceId: string, externalId: string): Promise<Incident | null>;
  create(incident: Incident): Promise<void>;
  update(incident: Incident): Promise<void>;
}

export interface IIncidentEventRepository {
  /** Oldest first. */
  listByIncident(incidentId: string): Promise<IncidentEvent[]>;
  append(event: IncidentEvent): Promise<void>;
}

export interface IRuntimeActionRepository {
  /** Oldest first. */
  listByIncident(incidentId: string): Promise<RuntimeAction[]>;
  findById(id: string): Promise<RuntimeAction | null>;
  create(action: RuntimeAction): Promise<void>;
  update(action: RuntimeAction): Promise<void>;
}
