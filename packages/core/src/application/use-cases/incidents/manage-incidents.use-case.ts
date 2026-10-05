/**
 * ManageIncidentsUseCase (spec 129): list and show incidents with their
 * timeline and actions, add notes, and resolve one with a postmortem — the
 * one given, or a draft from the timeline.
 */

import { injectable, inject } from 'tsyringe';
import {
  IncidentEventKind,
  IncidentStatus,
  type Incident,
  type IncidentEvent,
  type RuntimeAction,
} from '../../../domain/generated/output.js';
import { optionalText } from '../../../domain/shared/defined.js';
import { draftPostmortem } from '../../../domain/shared/incidents.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
  IRuntimeActionRepository,
} from '../../ports/output/repositories/incident-repository.interface.js';
import { failure, type OpportunityResult } from '../opportunities/opportunity-scope.js';
import { appendEvent } from './incident-timeline.js';

const UNRESOLVED: readonly IncidentStatus[] = [IncidentStatus.Open, IncidentStatus.Mitigated];

export interface IncidentDetail {
  incident: Incident;
  events: IncidentEvent[];
  actions: RuntimeAction[];
}

export interface ListIncidentsInput {
  /** Space id; every space when omitted. */
  space?: string;
  /** Only unresolved incidents. */
  open?: boolean;
}

@injectable()
export class ManageIncidentsUseCase {
  constructor(
    @inject('IIncidentRepository') private readonly incidents: IIncidentRepository,
    @inject('IIncidentEventRepository') private readonly events: IIncidentEventRepository,
    @inject('IRuntimeActionRepository') private readonly actions: IRuntimeActionRepository
  ) {}

  async list(input: ListIncidentsInput = {}): Promise<Incident[]> {
    return this.incidents.list({
      ...(input.space ? { spaceId: input.space } : {}),
      ...(input.open ? { statuses: UNRESOLVED } : {}),
    });
  }

  async get(id: string): Promise<OpportunityResult<{ detail: IncidentDetail }>> {
    const incident = await this.incidents.findById(id.trim());
    if (!incident) return failure(`No incident "${id}".`);
    const [events, actions] = await Promise.all([
      this.events.listByIncident(incident.id),
      this.actions.listByIncident(incident.id),
    ]);
    return { ok: true, detail: { incident, events, actions } };
  }

  async note(id: string, text: string): Promise<OpportunityResult<{ event: IncidentEvent }>> {
    const note = optionalText(text);
    if (!note) return failure('A note needs text.');
    const incident = await this.incidents.findById(id.trim());
    if (!incident) return failure(`No incident "${id}".`);
    return {
      ok: true,
      event: await appendEvent(this.events, incident.id, IncidentEventKind.Note, note),
    };
  }

  async resolve(
    id: string,
    postmortem?: string
  ): Promise<OpportunityResult<{ incident: Incident }>> {
    const found = await this.get(id);
    if (!found.ok) return found;
    const { incident, actions } = found.detail;
    if (incident.status === IncidentStatus.Resolved) {
      return failure(`${incident.title} is already resolved.`);
    }
    const now = new Date();
    await appendEvent(this.events, incident.id, IncidentEventKind.Resolved, 'Resolved');
    const events = await this.events.listByIncident(incident.id);
    const resolved: Incident = {
      ...incident,
      status: IncidentStatus.Resolved,
      resolvedAt: now,
      postmortem: optionalText(postmortem) ?? draftPostmortem(incident, events, actions, now),
      updatedAt: now,
    };
    await this.incidents.update(resolved);
    return { ok: true, incident: resolved };
  }
}
