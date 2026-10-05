/** Sample incidents for the Incidents stories (spec 129). */

import {
  ActionProposer,
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
  type Incident,
  type IncidentEvent,
  type RuntimeAction,
} from '@shepai/core/domain/generated/output';
import type { IncidentDetail } from '@shepai/core/application/use-cases/incidents/manage-incidents.use-case';
import type { RunAction } from '@/hooks/use-run-action';
import type { IncidentSpaceOption } from './incidents-types';

const T = new Date('2026-10-05T10:00:00Z');

function minutesLater(minutes: number): Date {
  return new Date(T.getTime() + minutes * 60_000);
}

export const SPACES: IncidentSpaceOption[] = [
  { id: 'space-acme', name: 'Acme', slug: 'acme' },
  { id: 'space-personal', name: 'Personal', slug: 'personal' },
];

export const CHECKOUT: Incident = {
  id: 'inc-checkout',
  spaceId: 'space-acme',
  title: 'Checkout 5xx above 5%',
  severity: IncidentSeverity.Critical,
  status: IncidentStatus.Open,
  source: IncidentSource.Alert,
  detail: 'Error rate on POST /checkout rose from 0.2% to 7% at 09:58.',
  url: 'https://grafana.example.com/d/checkout',
  runtimeContext: 'prod',
  runtimeNamespace: 'shop',
  runtimeWorkload: 'checkout',
  createdAt: T,
  updatedAt: T,
};

export const SEARCH: Incident = {
  id: 'inc-search',
  spaceId: 'space-acme',
  title: 'Slow search',
  severity: IncidentSeverity.Minor,
  status: IncidentStatus.Mitigated,
  source: IncidentSource.Manual,
  runtimeNamespace: 'shop',
  runtimeWorkload: 'search',
  mitigatedAt: minutesLater(30),
  createdAt: T,
  updatedAt: T,
};

export const RESOLVED: Incident = {
  ...SEARCH,
  id: 'inc-old',
  title: 'Login timeouts',
  status: IncidentStatus.Resolved,
  resolvedAt: minutesLater(90),
  postmortem:
    '# Postmortem: Login timeouts\n\n## Timeline\n- 10:00 Opened\n- 10:20 Restarted auth\n\n## Follow-ups\n- Alert on pool exhaustion',
};

function event(id: string, kind: IncidentEventKind, text: string, minutes: number): IncidentEvent {
  return { id, incidentId: CHECKOUT.id, kind, text, createdAt: minutesLater(minutes) };
}

export const EVENTS: IncidentEvent[] = [
  event('ev-1', IncidentEventKind.Opened, 'Opened from an alert.', 0),
  event(
    'ev-2',
    IncidentEventKind.Evidence,
    'deployment/checkout 3/3 ready, image checkout:4.12.0\nWarning BackOff pod/checkout-7d9 restarting',
    2
  ),
  event('ev-3', IncidentEventKind.Hypothesis, 'High: release 4.12.0 broke the tax client', 3),
  event(
    'ev-4',
    IncidentEventKind.ActionProposed,
    'Proposed roll back: errors began with 4.12.0',
    3
  ),
];

export const PROPOSED: RuntimeAction = {
  id: 'act-rollback',
  incidentId: CHECKOUT.id,
  kind: RuntimeActionKind.Rollback,
  status: RuntimeActionStatus.Proposed,
  proposedBy: ActionProposer.Agent,
  reason: 'Errors began with release 4.12.0.',
  createdAt: minutesLater(3),
  updatedAt: minutesLater(3),
};

export const SUCCEEDED: RuntimeAction = {
  ...PROPOSED,
  id: 'act-restart',
  kind: RuntimeActionKind.Restart,
  status: RuntimeActionStatus.Succeeded,
  proposedBy: ActionProposer.Person,
  reason: 'Clear the stuck connections.',
  output: 'deployment.apps/checkout restarted',
  recovered: false,
  decidedAt: minutesLater(1),
  executedAt: minutesLater(1),
};

export const DETAIL: IncidentDetail = {
  incident: CHECKOUT,
  events: EVENTS,
  actions: [PROPOSED, SUCCEEDED],
};

export const runInStory: RunAction = async (action) => (await action()).ok;
