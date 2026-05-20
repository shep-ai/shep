'use server';

import { resolve } from '@/lib/server-container';
import { FeatureFlagDisabledError, requireFeatureFlag } from '@/lib/feature-flags';
import type { EnableBedrockForApplicationUseCase } from '@shepai/core/application/use-cases/applications/enable-bedrock-for-application.use-case';
import { ApplicationNotFoundError } from '@shepai/core/domain/errors/application-not-found.error';
import { BedrockBinaryMissingError } from '@shepai/core/domain/errors/bedrock-binary-missing.error';
import { BedrockNotEnabledError } from '@shepai/core/domain/errors/bedrock-not-enabled.error';
import { PipxNotInstalledError } from '@shepai/core/domain/errors/pipx-not-installed.error';

export type EnableBedrockResult =
  | { ok: true; bedrockEnabled: boolean }
  | { ok: false; code: string; remediation: string };

export async function enableBedrock(applicationId: string): Promise<EnableBedrockResult> {
  if (!applicationId?.trim()) {
    return { ok: false, code: 'INVALID_INPUT', remediation: 'applicationId is required' };
  }

  try {
    requireFeatureFlag('bedrockIntegration');
    const useCase = resolve<EnableBedrockForApplicationUseCase>(
      'EnableBedrockForApplicationUseCase'
    );
    await useCase.execute({ applicationId });
    return { ok: true, bedrockEnabled: true };
  } catch (error: unknown) {
    if (error instanceof FeatureFlagDisabledError) {
      return {
        ok: false,
        code: 'FEATURE_FLAG_DISABLED',
        remediation: 'Enable the "Bedrock memory" feature flag in Settings → Feature Flags.',
      };
    }
    if (
      error instanceof PipxNotInstalledError ||
      error instanceof BedrockBinaryMissingError ||
      error instanceof BedrockNotEnabledError
    ) {
      return { ok: false, code: error.code, remediation: error.remediation };
    }
    if (error instanceof ApplicationNotFoundError) {
      return {
        ok: false,
        code: 'APPLICATION_NOT_FOUND',
        remediation: `Application ${applicationId} no longer exists. Reload the page and try again.`,
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to enable bedrock';
    return { ok: false, code: 'UNKNOWN', remediation: message };
  }
}
