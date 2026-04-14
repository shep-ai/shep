/**
 * Pure helper: compute PR status/mergeable/CI status delta events.
 *
 * Any change in any of the three tracked PR fields yields a single
 * `PhaseCompleted` notification, with the message/severity adjusted based on
 * whether the PR has a mergeability conflict.
 *
 * Mutates `prev` in place.
 */

import type { AgentRun, Feature, SdlcLifecycle } from '../../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
} from '../../../../domain/generated/output.js';
import { LIFECYCLE_TO_NODE } from '../../../../domain/shared/sdlc-lifecycle-mapping.js';

import type { CachedFeatureState, StreamedAgentEvent } from './stream-agent-events.types.js';

export interface ComputePrDeltasArgs {
  feature: Feature;
  run: AgentRun;
  prev: CachedFeatureState;
}

export function computePrDeltas(args: ComputePrDeltasArgs): StreamedAgentEvent[] {
  const { feature, run, prev } = args;

  const curPrStatus = feature.pr?.status;
  const curMergeable = feature.pr?.mergeable;
  const curCiStatus = feature.pr?.ciStatus;

  if (
    curPrStatus === prev.prStatus &&
    curMergeable === prev.prMergeable &&
    curCiStatus === prev.prCiStatus
  ) {
    return [];
  }

  prev.prStatus = curPrStatus;
  prev.prMergeable = curMergeable;
  prev.prCiStatus = curCiStatus;

  const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle] ?? 'merge';
  return [
    {
      kind: 'notification',
      event: {
        eventType: NotificationEventType.PhaseCompleted,
        agentRunId: run.id,
        featureId: feature.id,
        featureName: feature.name,
        phaseName: nodeName,
        message:
          curMergeable === false
            ? `PR #${feature.pr?.number} has merge conflicts`
            : `PR status updated`,
        severity: curMergeable === false ? NotificationSeverity.Warning : NotificationSeverity.Info,
        timestamp: new Date().toISOString(),
      },
    },
  ];
}
