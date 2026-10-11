/** Storybook mock of app/actions/feature-checkpoints (spec 135): fixture data, no DI. */
import type { ActionResult } from '@/lib/action-outcome';
import {
  fixtureCheckpointDiff,
  fixtureCheckpointList,
} from '@/components/features/checkpoints/checkpoint-fixtures';

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export async function listFeatureCheckpoints(_featureId: string) {
  return ok(fixtureCheckpointList);
}

export async function getFeatureCheckpointDiff(_input: {
  featureId: string;
  from?: string;
  to: string;
}) {
  return ok(fixtureCheckpointDiff);
}

export async function restoreFeatureCheckpoint(_input: { featureId: string; step: string }) {
  return ok({ restored: fixtureCheckpointList.checkpoints[2], safety: null });
}
