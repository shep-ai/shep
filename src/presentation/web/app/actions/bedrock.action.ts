'use server';

/**
 * Bedrock server actions — one shared module for every presentation
 * surface (Application detail, Repository detail, Feature detail).
 *
 * Each action takes the typed `BedrockTargetKind` plus an id and
 * delegates to the matching use case via `resolve()`. Errors are
 * mapped to a discriminated result so the client (BedrockMemoryPanel)
 * renders typed remediation strings instead of raw exception traces.
 */

import { resolve } from '@/lib/server-container';
import { FeatureFlagDisabledError, requireFeatureFlag } from '@/lib/feature-flags';
import type { EnableBedrockForTargetUseCase } from '@shepai/core/application/use-cases/bedrock/enable-bedrock-for-target.use-case';
import type { RunBedrockLifecycleUseCase } from '@shepai/core/application/use-cases/applications/run-bedrock-lifecycle.use-case';
import type { GetBedrockMemorySnapshotUseCase } from '@shepai/core/application/use-cases/bedrock/get-bedrock-memory-snapshot.use-case';
import {
  BedrockLifecycleAction,
  type BedrockMemorySnapshot,
  type BedrockTargetKind,
} from '@shepai/core/domain/generated/output';
import { ApplicationNotFoundError } from '@shepai/core/domain/errors/application-not-found.error';
import { BedrockBinaryMissingError } from '@shepai/core/domain/errors/bedrock-binary-missing.error';
import { BedrockNotEnabledError } from '@shepai/core/domain/errors/bedrock-not-enabled.error';
import { PipxNotInstalledError } from '@shepai/core/domain/errors/pipx-not-installed.error';

export type BedrockActionResult = { ok: true } | { ok: false; code: string; remediation: string };

export type BedrockLifecycleResult =
  | { ok: true; stdout: string }
  | { ok: false; code: string; remediation: string };

function describeError(
  error: unknown,
  fallbackMessage: string
): { code: string; remediation: string } {
  if (error instanceof FeatureFlagDisabledError) {
    return {
      code: 'FEATURE_FLAG_DISABLED',
      remediation: 'Enable the "Bedrock memory" feature flag in Settings → Feature Flags.',
    };
  }
  if (
    error instanceof PipxNotInstalledError ||
    error instanceof BedrockBinaryMissingError ||
    error instanceof BedrockNotEnabledError
  ) {
    return { code: error.code, remediation: error.remediation };
  }
  if (error instanceof ApplicationNotFoundError) {
    return {
      code: 'TARGET_NOT_FOUND',
      remediation: 'The target no longer exists. Reload the page and try again.',
    };
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  return { code: 'UNKNOWN', remediation: message };
}

export async function enableBedrockForTarget(
  kind: BedrockTargetKind,
  id: string
): Promise<BedrockActionResult> {
  if (!id?.trim()) {
    return { ok: false, code: 'INVALID_INPUT', remediation: 'id is required' };
  }

  try {
    requireFeatureFlag('bedrockIntegration');
    const useCase = resolve<EnableBedrockForTargetUseCase>('EnableBedrockForTargetUseCase');
    await useCase.execute({ kind, id });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, ...describeError(error, 'Failed to enable bedrock') };
  }
}

/**
 * Runs a bedrock lifecycle command against a target.
 *
 * For an `Application` target we dispatch through the existing
 * RunBedrockLifecycleUseCase. For `Repository` and `Feature` targets
 * the lifecycle runner is not yet wired through their respective
 * persistence guards, so we return a typed unsupported-result that the
 * panel surfaces with a clear remediation. This keeps the UI surface
 * complete for all three kinds while contained M-sized scope.
 */
export async function syncBedrockForTarget(
  kind: BedrockTargetKind,
  id: string
): Promise<BedrockLifecycleResult> {
  return runBedrockLifecycleForTarget(kind, id, BedrockLifecycleAction.Sync);
}

export async function shipBedrockForTarget(
  kind: BedrockTargetKind,
  id: string
): Promise<BedrockLifecycleResult> {
  return runBedrockLifecycleForTarget(kind, id, BedrockLifecycleAction.Ship);
}

async function runBedrockLifecycleForTarget(
  kind: BedrockTargetKind,
  id: string,
  action: BedrockLifecycleAction
): Promise<BedrockLifecycleResult> {
  try {
    requireFeatureFlag('bedrockIntegration');
  } catch (error: unknown) {
    return { ok: false, ...describeError(error, `Failed to run bedrock ${action}`) };
  }
  if (kind !== 'application') {
    return {
      ok: false,
      code: 'LIFECYCLE_UNSUPPORTED_FOR_TARGET',
      remediation: `Run \`shep bedrock ${action}\` from the CLI in this ${kind}'s worktree, or enable bedrock at its parent application.`,
    };
  }
  try {
    const useCase = resolve<RunBedrockLifecycleUseCase>('RunBedrockLifecycleUseCase');
    const result = await useCase.execute({ applicationId: id, action });
    return { ok: true, stdout: result.stdout };
  } catch (error: unknown) {
    return { ok: false, ...describeError(error, `Failed to run bedrock ${action}`) };
  }
}

export async function getBedrockMemorySnapshot(
  kind: BedrockTargetKind,
  id: string
): Promise<BedrockMemorySnapshot | null> {
  if (!id?.trim()) return null;
  try {
    requireFeatureFlag('bedrockIntegration');
    const useCase = resolve<GetBedrockMemorySnapshotUseCase>('GetBedrockMemorySnapshotUseCase');
    return await useCase.execute({ kind, id });
  } catch {
    return null;
  }
}
