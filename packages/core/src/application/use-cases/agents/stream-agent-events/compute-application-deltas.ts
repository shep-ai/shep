/**
 * Pure helper: compute ApplicationUpdated delta for a single application row.
 *
 * Diffs the current `Application` against the cached snapshot of a watched
 * field set. Emits at most ONE notification event carrying the full updated
 * payload. Seed case (no prev) returns zero events — the caller is expected
 * to populate the cache on first sight.
 *
 * Pure: no I/O, no timers, no side effects. `prev` is NOT mutated here — the
 * use-case owns cache lifecycle so the helper stays trivially testable.
 */

import type { Application } from '../../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
} from '../../../../domain/generated/output.js';

import type { CachedApplicationState, StreamedAgentEvent } from './stream-agent-events.types.js';

const WATCHED_FIELDS = [
  'setupComplete',
  'status',
  'gitRemoteUrl',
  'cloudDeploymentProvider',
] as const;

export interface ComputeApplicationDeltasArgs {
  application: Application;
  prev: CachedApplicationState | undefined;
}

export function computeApplicationDeltas(args: ComputeApplicationDeltasArgs): StreamedAgentEvent[] {
  const { application, prev } = args;

  if (prev === undefined) return [];

  let changed = false;
  for (const field of WATCHED_FIELDS) {
    if (prev[field] !== application[field]) {
      changed = true;
      break;
    }
  }
  if (!changed) return [];

  return [
    {
      kind: 'notification',
      event: {
        eventType: NotificationEventType.ApplicationUpdated,
        agentRunId: '',
        featureId: application.id,
        featureName: application.name,
        message: `Application "${application.name}" updated`,
        severity: NotificationSeverity.Info,
        timestamp: new Date().toISOString(),
        applicationUpdate: {
          applicationId: application.id,
          setupComplete: application.setupComplete,
          status: application.status,
          gitRemoteUrl: application.gitRemoteUrl,
          cloudDeploymentProvider: application.cloudDeploymentProvider,
        },
      },
    },
  ];
}
