/**
 * Pure helper: compute feature name change + lifecycle transition events.
 *
 * Handles two closely-related deltas that both key off `feature` properties:
 * - Feature name change (AI metadata rename mid-flight).
 * - Lifecycle transition — normal phase progress, or special-cased
 *   `MergeReviewReady` when entering the Review lifecycle.
 *
 * Mutates `prev` in place.
 */

import type { AgentRun, Feature, SdlcLifecycle } from '../../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
  SdlcLifecycle as SdlcLifecycleEnum,
} from '../../../../domain/generated/output.js';
import { LIFECYCLE_TO_NODE } from '../../../../domain/shared/sdlc-lifecycle-mapping.js';

import type { CachedFeatureState, StreamedAgentEvent } from './stream-agent-events.types.js';

export interface ComputeFeatureDeltasArgs {
  feature: Feature;
  run: AgentRun;
  prev: CachedFeatureState;
}

export function computeFeatureDeltas(args: ComputeFeatureDeltasArgs): StreamedAgentEvent[] {
  const { feature, run, prev } = args;
  const events: StreamedAgentEvent[] = [];

  // Feature name change (AI metadata generation may rename a feature mid-flight).
  if (prev.featureName !== feature.name) {
    prev.featureName = feature.name;
    const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle] ?? 'requirements';
    events.push({
      kind: 'notification',
      event: {
        eventType: NotificationEventType.PhaseCompleted,
        agentRunId: run.id,
        featureId: feature.id,
        featureName: feature.name,
        phaseName: nodeName,
        message: `Feature metadata updated`,
        severity: NotificationSeverity.Info,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Lifecycle change — agent stays "running" while it moves between phases.
  if (prev.lifecycle !== feature.lifecycle) {
    const prevLifecycle = prev.lifecycle;
    prev.lifecycle = feature.lifecycle;
    const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle];

    if (
      feature.lifecycle === SdlcLifecycleEnum.Review &&
      prevLifecycle !== SdlcLifecycleEnum.Review
    ) {
      const prUrl = feature.pr?.url;
      const message = prUrl ? `Ready for merge review — PR: ${prUrl}` : 'Ready for merge review';
      events.push({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.MergeReviewReady,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          phaseName: 'merge',
          message,
          severity: NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        },
      });
    } else if (nodeName) {
      events.push({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.PhaseCompleted,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          phaseName: nodeName,
          message: `Entered ${nodeName} phase`,
          severity: NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  return events;
}
