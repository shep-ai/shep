/**
 * Incident rules (spec 129): which runtime actions a space lets shep run on
 * its own, which incidents are urgent, how the triage agent's answer is
 * checked, and the postmortem drafted from a timeline.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import {
  type HypothesisConfidence,
  IncidentSeverity,
  RuntimeActionKind,
  RuntimeActionStatus,
  type Incident,
  type IncidentEvent,
  type RuntimeAction,
  type SpaceAgentSettings,
} from '../generated/output';
import { CONFIDENCE_ORDER, parseConfidence } from './investigation';

/** Hypotheses kept from one triage. */
export const MAX_INCIDENT_HYPOTHESES = 3;
/** Most replicas a scale action may ask for. */
export const MAX_SCALE_REPLICAS = 100;
/** Seconds shep waits for a rollout to be ready after an action. */
export const RECOVERY_TIMEOUT_SECONDS = 180;

const MS_PER_MINUTE = 60_000;
const URGENT_SEVERITIES: readonly IncidentSeverity[] = [
  IncidentSeverity.Critical,
  IncidentSeverity.Major,
];
const ACTION_KINDS = new Set<string>(Object.values(RuntimeActionKind));

export interface IncidentHypothesis {
  cause: string;
  confidence: HypothesisConfidence;
  evidence: string;
}

export interface ActionProposal {
  kind: RuntimeActionKind;
  replicas?: number;
  reason: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isAutoApproved(
  settings: Pick<SpaceAgentSettings, 'autoRuntimeActions'> | undefined,
  kind: RuntimeActionKind
): boolean {
  return settings?.autoRuntimeActions?.includes(kind) ?? false;
}

export function isUrgentSeverity(severity: IncidentSeverity): boolean {
  return URGENT_SEVERITIES.includes(severity);
}

export function actionLabel(kind: RuntimeActionKind, replicas?: number): string {
  switch (kind) {
    case RuntimeActionKind.Restart:
      return 'restart';
    case RuntimeActionKind.Rollback:
      return 'rollback';
    case RuntimeActionKind.Scale:
      return `scale to ${replicas ?? '?'} replicas`;
  }
}

/** The agent's hypotheses, most likely first, empty ones dropped. */
export function rankIncidentHypotheses(raw: unknown): IncidentHypothesis[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: { cause?: unknown; confidence?: unknown; evidence?: unknown } | null) => ({
      cause: text(item?.cause),
      confidence: parseConfidence(item?.confidence),
      evidence: text(item?.evidence),
    }))
    .filter((hypothesis) => hypothesis.cause !== '')
    .sort((a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence))
    .slice(0, MAX_INCIDENT_HYPOTHESES);
}

/** The agent's proposed action, or undefined when it is not one shep can run. */
export function parseActionProposal(raw: unknown): ActionProposal | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { kind, replicas, reason } = raw as {
    kind?: unknown;
    replicas?: unknown;
    reason?: unknown;
  };
  if (typeof kind !== 'string' || !ACTION_KINDS.has(kind)) return undefined;
  const actionKind = kind as RuntimeActionKind;
  if (actionKind !== RuntimeActionKind.Scale) return { kind: actionKind, reason: text(reason) };
  if (
    typeof replicas !== 'number' ||
    !Number.isInteger(replicas) ||
    replicas < 0 ||
    replicas > MAX_SCALE_REPLICAS
  ) {
    return undefined;
  }
  return { kind: actionKind, replicas, reason: text(reason) };
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MS_PER_MINUTE));
}

function workload(incident: Incident): string {
  if (!incident.runtimeWorkload) return 'not recorded';
  const namespace = incident.runtimeNamespace ?? 'default';
  return `${namespace}/${incident.runtimeWorkload}${incident.runtimeContext ? ` (${incident.runtimeContext})` : ''}`;
}

/** A Markdown postmortem from the incident, its timeline and its actions. */
export function draftPostmortem(
  incident: Incident,
  events: readonly IncidentEvent[],
  actions: readonly RuntimeAction[],
  resolvedAt: Date
): string {
  const recoveredAt = incident.mitigatedAt ?? resolvedAt;
  const impact = minutesBetween(incident.createdAt, recoveredAt);
  const ran = actions.filter(
    (action) =>
      action.status === RuntimeActionStatus.Succeeded ||
      action.status === RuntimeActionStatus.Failed
  );
  const lines = [
    `# Postmortem: ${incident.title}`,
    '',
    `- Severity: ${incident.severity}`,
    `- Workload: ${workload(incident)}`,
    `- Opened: ${incident.createdAt.toISOString()}`,
    `- Recovered: ${recoveredAt.toISOString()} (about ${impact} minutes after opening)`,
    `- Resolved: ${resolvedAt.toISOString()}`,
    '',
    '## Timeline',
    '',
    ...events.map((event) => `- ${event.createdAt.toISOString()} — ${event.kind}: ${event.text}`),
    '',
    '## Actions',
    '',
    ...(ran.length > 0
      ? ran.map(
          (action) =>
            `- ${actionLabel(action.kind, action.replicas)} (${action.proposedBy}): ${action.status}${action.recovered === undefined ? '' : action.recovered ? ', recovered' : ', not recovered'} — ${action.reason}`
        )
      : ['- No runtime action ran.']),
    '',
    '## Follow-ups',
    '',
    '- Root cause confirmed:',
    '- What would have caught it earlier:',
    '- Work items to prevent a repeat:',
  ];
  return lines.join('\n');
}
