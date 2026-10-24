'use server';

/**
 * Batch approval for the fleet triage drawer (spec 111).
 *
 * Thin server action over `BatchApproveFeaturesUseCase` — the same use case
 * `shep fleet approve` runs — so the web drawer and the CLI can never disagree
 * about what "approve all P1" does. No business logic lives here: the
 * sequential, error-isolated approval loop, the P1/gate filtering and the
 * per-feature failure collection are all the use case's job.
 *
 * The use case is imported as a **type** and resolved by string token, which is
 * the convention every other action in this directory follows (see the note in
 * `fleet-data.ts`): a value import makes Turbopack bundle core's module graph,
 * whose `.js`-suffixed relative imports the Next build cannot resolve.
 *
 * Errors are returned, not thrown. A thrown server-action rejection surfaces in
 * the browser as an opaque digest, and the drawer needs a string it can toast.
 */

import { resolve } from '@/lib/server-container';
import type {
  BatchApproveFeaturesUseCase as BatchApproveFeatures,
  BatchApproveFeaturesInput,
  BatchApproveResult,
} from '@shepai/core/application/use-cases/fleet/batch-approve-features.use-case';

/** The use case's result plus a transport-level failure the drawer can toast. */
export interface BatchApproveFeaturesResponse extends BatchApproveResult {
  /** Set when the batch could not be attempted at all. */
  error?: string;
}

const NOTHING_ATTEMPTED: BatchApproveResult = {
  totalAttempted: 0,
  approvedCount: 0,
  approvedFeatureIds: [],
  failedCount: 0,
  failures: [],
  skippedCount: 0,
  skipped: [],
};

/**
 * Approves the features currently waiting at P1 approval gates.
 *
 * @param input Optional scope — specific `featureIds` and/or a `gateType`.
 *              Omit it to approve every waiting P1 gate, as `--all` does.
 */
export async function batchApproveFeatures(
  input: BatchApproveFeaturesInput = {}
): Promise<BatchApproveFeaturesResponse> {
  try {
    return await resolve<BatchApproveFeatures>('BatchApproveFeaturesUseCase').execute(input);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve features';
    return { ...NOTHING_ATTEMPTED, error: message };
  }
}
