import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BedrockNotEnabledError } from '@shepai/core/domain/errors/bedrock-not-enabled.error';
import { PipxNotInstalledError } from '@shepai/core/domain/errors/pipx-not-installed.error';
import { BedrockBinaryMissingError } from '@shepai/core/domain/errors/bedrock-binary-missing.error';
import { ApplicationNotFoundError } from '@shepai/core/domain/errors/application-not-found.error';

const mockEnableExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'EnableBedrockForApplicationUseCase') {
      return { execute: mockEnableExecute };
    }
    throw new Error(`Unknown token: ${token}`);
  },
}));

// Bedrock server actions are gated behind the bedrockIntegration feature flag.
// Force it ON for every test in this file so we exercise the actual error paths
// (e.g. UseCase rejection) rather than tripping the feature-flag guard.
vi.mock('@/lib/feature-flags', () => ({
  requireFeatureFlag: vi.fn(),
  FeatureFlagDisabledError: class FeatureFlagDisabledError extends Error {
    constructor(public readonly flag: string) {
      super(`Feature flag "${flag}" is disabled`);
      this.name = 'FeatureFlagDisabledError';
    }
  },
}));

const { enableBedrock } = await import(
  '../../../../../src/presentation/web/app/actions/enable-bedrock.action.js'
);

describe('enableBedrock server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when applicationId is empty', async () => {
    const result = await enableBedrock('');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      remediation: 'applicationId is required',
    });
    expect(mockEnableExecute).not.toHaveBeenCalled();
  });

  it('returns { ok: true, bedrockEnabled: true } on success', async () => {
    mockEnableExecute.mockResolvedValue({
      action: 'init',
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await enableBedrock('app-1');

    expect(result).toEqual({ ok: true, bedrockEnabled: true });
    expect(mockEnableExecute).toHaveBeenCalledWith({ applicationId: 'app-1' });
  });

  it('maps ApplicationNotFoundError to structured failure', async () => {
    mockEnableExecute.mockRejectedValue(new ApplicationNotFoundError('app-1'));

    const result = await enableBedrock('app-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('APPLICATION_NOT_FOUND');
      expect(typeof result.remediation).toBe('string');
    }
  });

  it('maps PipxNotInstalledError to structured failure with platform remediation', async () => {
    mockEnableExecute.mockRejectedValue(new PipxNotInstalledError('darwin'));

    const result = await enableBedrock('app-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PIPX_NOT_INSTALLED');
      expect(result.remediation).toContain('pipx');
    }
  });

  it('maps BedrockBinaryMissingError to structured failure', async () => {
    mockEnableExecute.mockRejectedValue(new BedrockBinaryMissingError());

    const result = await enableBedrock('app-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BEDROCK_BINARY_MISSING');
      expect(result.remediation).toContain('pipx');
    }
  });

  it('maps BedrockNotEnabledError to structured failure', async () => {
    mockEnableExecute.mockRejectedValue(new BedrockNotEnabledError('app-1'));

    const result = await enableBedrock('app-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BEDROCK_NOT_ENABLED');
    }
  });

  it('maps unknown errors to a generic structured failure', async () => {
    mockEnableExecute.mockRejectedValue(new Error('boom'));

    const result = await enableBedrock('app-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNKNOWN');
      expect(result.remediation).toContain('boom');
    }
  });
});
