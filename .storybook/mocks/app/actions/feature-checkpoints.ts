/** Storybook mock of app/actions/feature-checkpoints (spec 138): fixture data, no DI. */
import type { ActionResult } from '@/lib/action-outcome';
import {
  fixtureCheckpointDiff,
  fixtureCheckpointList,
} from '@/components/features/checkpoints/checkpoint-fixtures';

/** A checkpoint's label is the last component of its ref (`0003-implement`). */
const byLabel = (label: string) =>
  fixtureCheckpointList.checkpoints.find((c) => c.ref.endsWith(`/${label}`));

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export async function listFeatureCheckpoints(_featureId: string) {
  return ok(fixtureCheckpointList);
}

/** Same files for every pair, but the header names the steps that were asked for. */
export async function getFeatureCheckpointDiff(input: {
  featureId: string;
  from?: string;
  to: string;
}) {
  const to = byLabel(input.to) ?? fixtureCheckpointDiff.to;
  const from =
    (input.from ? byLabel(input.from) : undefined) ??
    fixtureCheckpointList.checkpoints.find((c) => c.sequence === to.sequence - 1) ??
    fixtureCheckpointDiff.from;
  return ok({ ...fixtureCheckpointDiff, from, to });
}

export async function restoreFeatureCheckpoint(_input: { featureId: string; step: string }) {
  return ok({ restored: fixtureCheckpointList.checkpoints[2], safety: null });
}
