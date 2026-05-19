/**
 * AiChangeRiskSignal Database Mapper
 *
 * Feature 098, phase 8 (task-49). Maps between the AiChangeRiskSignal
 * domain object and rows in the ai_change_risk_signals table
 * (migration 114). Evidence payload is stored as a JSON-encoded string;
 * the TSP entity treats it as opaque so the mapper round-trips it
 * untouched.
 */

import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '../../../../domain/generated/output.js';

export interface AiChangeRiskSignalRow {
  id: string;
  application_id: string;
  agent_session_id: string | null;
  signal_type: string;
  severity: string;
  summary: string;
  evidence: string | null;
  state: string;
  owner_id: string | null;
  graduated_finding_id: string | null;
  discovered_at: number;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function ensureSignalType(value: string): AiSignalType {
  const known = Object.values(AiSignalType) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown AiSignalType persisted in ai_change_risk_signals: ${value}`);
  }
  return value as AiSignalType;
}

function ensureSeverity(value: string): CanonicalSeverity {
  const known = Object.values(CanonicalSeverity) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown CanonicalSeverity persisted in ai_change_risk_signals: ${value}`);
  }
  return value as CanonicalSeverity;
}

function ensureState(value: string): AiSignalState {
  const known = Object.values(AiSignalState) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown AiSignalState persisted in ai_change_risk_signals: ${value}`);
  }
  return value as AiSignalState;
}

export function toDatabase(signal: AiChangeRiskSignal): AiChangeRiskSignalRow {
  return {
    id: signal.id,
    application_id: signal.applicationId,
    agent_session_id: signal.agentSessionId ?? null,
    signal_type: signal.signalType,
    severity: signal.severity,
    summary: signal.summary,
    evidence: signal.evidence ?? null,
    state: signal.state,
    owner_id: signal.ownerId ?? null,
    graduated_finding_id: signal.graduatedFindingId ?? null,
    discovered_at: toMillis(signal.discoveredAt as Date),
    resolved_at: signal.resolvedAt ? toMillis(signal.resolvedAt as Date) : null,
    created_at: toMillis(signal.createdAt),
    updated_at: toMillis(signal.updatedAt),
    deleted_at: signal.deletedAt ? toMillis(signal.deletedAt) : null,
  };
}

export function fromDatabase(row: AiChangeRiskSignalRow): AiChangeRiskSignal {
  return {
    id: row.id,
    applicationId: row.application_id,
    agentSessionId: row.agent_session_id ?? undefined,
    signalType: ensureSignalType(row.signal_type),
    severity: ensureSeverity(row.severity),
    summary: row.summary,
    evidence: row.evidence ?? undefined,
    state: ensureState(row.state),
    ownerId: row.owner_id ?? undefined,
    graduatedFindingId: row.graduated_finding_id ?? undefined,
    discoveredAt: new Date(row.discovered_at),
    resolvedAt: row.resolved_at !== null ? new Date(row.resolved_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
