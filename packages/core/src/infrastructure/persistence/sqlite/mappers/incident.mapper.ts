/** Row ⇄ entity conversion for incidents, their timeline and runtime actions (spec 129). */

import type {
  ActionProposer,
  Incident,
  IncidentEvent,
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  RuntimeAction,
  RuntimeActionKind,
  RuntimeActionStatus,
} from '../../../../domain/generated/output.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface IncidentRow {
  id: string;
  space_id: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  detail: string | null;
  url: string | null;
  external_id: string | null;
  runtime_context: string | null;
  runtime_namespace: string | null;
  runtime_workload: string | null;
  signal_id: string | null;
  mitigated_at: number | null;
  resolved_at: number | null;
  postmortem: string | null;
  created_at: number;
  updated_at: number;
}

export interface IncidentEventRow {
  id: string;
  incident_id: string;
  kind: string;
  text: string;
  created_at: number;
}

export interface RuntimeActionRow {
  id: string;
  incident_id: string;
  kind: string;
  replicas: number | null;
  status: string;
  proposed_by: string;
  reason: string;
  output: string | null;
  recovered: number | null;
  decided_at: number | null;
  executed_at: number | null;
  created_at: number;
  updated_at: number;
}

const dateOrNull = (value: number | null) => optionalDate(value);

export function incidentToDatabase(incident: Incident): IncidentRow {
  return {
    id: incident.id,
    space_id: incident.spaceId,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    source: incident.source,
    detail: incident.detail ?? null,
    url: incident.url ?? null,
    external_id: incident.externalId ?? null,
    runtime_context: incident.runtimeContext ?? null,
    runtime_namespace: incident.runtimeNamespace ?? null,
    runtime_workload: incident.runtimeWorkload ?? null,
    signal_id: incident.signalId ?? null,
    mitigated_at: optionalMillis(incident.mitigatedAt),
    resolved_at: optionalMillis(incident.resolvedAt),
    postmortem: incident.postmortem ?? null,
    created_at: millis(incident.createdAt),
    updated_at: millis(incident.updatedAt),
  };
}

export function incidentFromDatabase(row: IncidentRow): Incident {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    source: row.source as IncidentSource,
    ...defined({
      detail: row.detail,
      url: row.url,
      externalId: row.external_id,
      runtimeContext: row.runtime_context,
      runtimeNamespace: row.runtime_namespace,
      runtimeWorkload: row.runtime_workload,
      signalId: row.signal_id,
      mitigatedAt: dateOrNull(row.mitigated_at),
      resolvedAt: dateOrNull(row.resolved_at),
      postmortem: row.postmortem,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function incidentEventToDatabase(event: IncidentEvent): IncidentEventRow {
  return {
    id: event.id,
    incident_id: event.incidentId,
    kind: event.kind,
    text: event.text,
    created_at: millis(event.createdAt),
  };
}

export function incidentEventFromDatabase(row: IncidentEventRow): IncidentEvent {
  return {
    id: row.id,
    incidentId: row.incident_id,
    kind: row.kind as IncidentEventKind,
    text: row.text,
    createdAt: new Date(row.created_at),
  };
}

export function runtimeActionToDatabase(action: RuntimeAction): RuntimeActionRow {
  return {
    id: action.id,
    incident_id: action.incidentId,
    kind: action.kind,
    replicas: action.replicas ?? null,
    status: action.status,
    proposed_by: action.proposedBy,
    reason: action.reason,
    output: action.output ?? null,
    recovered: action.recovered === undefined ? null : action.recovered ? 1 : 0,
    decided_at: optionalMillis(action.decidedAt),
    executed_at: optionalMillis(action.executedAt),
    created_at: millis(action.createdAt),
    updated_at: millis(action.updatedAt),
  };
}

export function runtimeActionFromDatabase(row: RuntimeActionRow): RuntimeAction {
  return {
    id: row.id,
    incidentId: row.incident_id,
    kind: row.kind as RuntimeActionKind,
    status: row.status as RuntimeActionStatus,
    proposedBy: row.proposed_by as ActionProposer,
    reason: row.reason,
    ...defined({
      replicas: row.replicas,
      output: row.output,
      recovered: row.recovered === null ? null : row.recovered === 1,
      decidedAt: dateOrNull(row.decided_at),
      executedAt: dateOrNull(row.executed_at),
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
