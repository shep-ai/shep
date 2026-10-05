/** The incident triage prompt and answer schema (spec 129). */

import { RuntimeActionKind, type Incident } from '../../../domain/generated/output.js';
import { MAX_INCIDENT_HYPOTHESES } from '../../../domain/shared/incidents.js';
import type { RuntimeEvidence } from '../../ports/output/services/runtime-controller.interface.js';

/** The answer's way of saying "no action". */
export const NO_ACTION = 'None';

export interface TriageAnswer {
  summary?: unknown;
  hypotheses?: unknown;
  action?: unknown;
}

export const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    hypotheses: {
      type: 'array',
      maxItems: MAX_INCIDENT_HYPOTHESES,
      items: {
        type: 'object',
        properties: {
          cause: { type: 'string' },
          confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          evidence: { type: 'string' },
        },
        required: ['cause', 'confidence', 'evidence'],
        additionalProperties: false,
      },
    },
    action: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...Object.values(RuntimeActionKind), NO_ACTION] },
        replicas: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['kind', 'reason'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'hypotheses', 'action'],
  additionalProperties: false,
} as const;

function section(title: string, body: string | undefined): string {
  return `## ${title}\n\n${body?.trim() ? body.trim() : '(none)'}`;
}

export function triagePrompt(incident: Incident, evidence: RuntimeEvidence | undefined): string {
  const workload = incident.runtimeWorkload
    ? `${incident.runtimeNamespace ?? 'default'}/${incident.runtimeWorkload}`
    : 'not named';
  return `You are triaging a production incident. Read what is known and answer with:
- summary: one or two sentences on what is happening;
- hypotheses: up to ${MAX_INCIDENT_HYPOTHESES} likely causes, each with a confidence (High, Medium, Low) and the evidence for it;
- action: the one runtime action most likely to restore service now — ${Object.values(RuntimeActionKind).join(', ')} (with replicas) — or ${NO_ACTION} when none would help or the workload is not named. Prefer the least disruptive action that fits the evidence.

Incident: ${incident.title}
Severity: ${incident.severity}
Workload (Kubernetes deployment): ${workload}
Opened: ${incident.createdAt.toISOString()}

${section('Description', incident.detail)}

${section('Rollout status', evidence?.status)}

${section('Recent events', evidence?.events)}

${section('Recent logs', evidence?.logs)}`;
}
