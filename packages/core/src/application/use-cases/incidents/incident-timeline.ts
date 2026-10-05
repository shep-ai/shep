/** Shared helpers for the incident use cases (spec 129). */

import { randomUUID } from 'node:crypto';
import type {
  Incident,
  IncidentEvent,
  IncidentEventKind,
} from '../../../domain/generated/output.js';
import type { IIncidentEventRepository } from '../../ports/output/repositories/incident-repository.interface.js';
import type { RuntimeTarget } from '../../ports/output/services/runtime-controller.interface.js';

export async function appendEvent(
  events: IIncidentEventRepository,
  incidentId: string,
  kind: IncidentEventKind,
  text: string
): Promise<IncidentEvent> {
  const event: IncidentEvent = { id: randomUUID(), incidentId, kind, text, createdAt: new Date() };
  await events.append(event);
  return event;
}

/** The workload an incident concerns, or undefined when it names none. */
export function runtimeTarget(incident: Incident): RuntimeTarget | undefined {
  if (!incident.runtimeWorkload || !incident.runtimeNamespace) return undefined;
  return {
    ...(incident.runtimeContext ? { context: incident.runtimeContext } : {}),
    namespace: incident.runtimeNamespace,
    workload: incident.runtimeWorkload,
  };
}
