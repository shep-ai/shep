/**
 * pr.opened / pr.merged (spec 133).
 *
 * A PR is observed by several detectors — the merge node, both paths of the
 * PR sync watcher and the GitHub webhook — so each event is recorded once per
 * feature through a once-key. The feature id stays local: the key is hashed
 * and only the build mode is sent.
 */

import { TelemetryEvent, type Feature } from '../../../domain/generated/output.js';
import type { ITelemetry } from '../../../application/ports/output/services/telemetry.interface.js';

type PrFeature = Pick<Feature, 'id' | 'buildMode'>;

export function recordPrOpened(telemetry: ITelemetry, feature: PrFeature): void {
  telemetry.record(
    TelemetryEvent.PrOpened,
    { buildMode: feature.buildMode },
    { onceKey: `${TelemetryEvent.PrOpened}:${feature.id}` }
  );
}

export function recordPrMerged(
  telemetry: ITelemetry,
  feature: PrFeature,
  viaPullRequest: boolean
): void {
  telemetry.record(
    TelemetryEvent.PrMerged,
    { buildMode: feature.buildMode, viaPullRequest },
    { onceKey: `${TelemetryEvent.PrMerged}:${feature.id}` }
  );
}
