'use server';

/**
 * Server actions for the Learning page (spec 150). Each calls one use case
 * and turns its refusal reason into the page's error message.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import type { AdoptHarnessVersionUseCase } from '@shepai/core/application/use-cases/harness-learning/adopt-harness-version.use-case';
import type { RejectHarnessVersionUseCase } from '@shepai/core/application/use-cases/harness-learning/reject-harness-version.use-case';
import type { RollbackHarnessVersionUseCase } from '@shepai/core/application/use-cases/harness-learning/rollback-harness-version.use-case';

const ACTOR = 'user:web';

export async function adoptHarnessVersion(versionId: string) {
  return attemptOutcome(async () => {
    const r = await resolve<AdoptHarnessVersionUseCase>('AdoptHarnessVersionUseCase').execute({
      versionId,
      actor: ACTOR,
    });
    return { ok: r.adopted, ...(r.reason ? { error: r.reason } : {}) };
  });
}

export async function rejectHarnessVersion(versionId: string, feedback?: string) {
  return attemptOutcome(async () => {
    const r = await resolve<RejectHarnessVersionUseCase>('RejectHarnessVersionUseCase').execute({
      versionId,
      actor: ACTOR,
      ...(feedback ? { feedback } : {}),
    });
    return { ok: r.rejected, ...(r.reason ? { error: r.reason } : {}) };
  });
}

export async function rollbackHarness(repositoryPath: string, reason?: string) {
  return attemptOutcome(async () => {
    const r = await resolve<RollbackHarnessVersionUseCase>('RollbackHarnessVersionUseCase').execute(
      { repositoryPath, ...(reason ? { reason } : {}) }
    );
    return { ok: r.rolledBack, ...(r.reason ? { error: r.reason } : {}) };
  });
}
