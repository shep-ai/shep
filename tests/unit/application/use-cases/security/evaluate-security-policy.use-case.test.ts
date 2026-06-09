/**
 * EvaluateSecurityPolicyUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvaluateSecurityPolicyUseCase } from '@/application/use-cases/security/evaluate-security-policy.use-case.js';
import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import type { EffectivePolicySnapshot, Settings } from '@/domain/generated/output.js';
import type { ISecurityPolicyService } from '@/application/ports/output/services/security-policy-service.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

function createMockPolicy(): EffectivePolicySnapshot {
  return {
    mode: SecurityMode.Advisory,
    source: 'shep.security.yaml',
    evaluatedAt: new Date().toISOString(),
    actionDispositions: Object.values(SecurityActionCategory).map((category) => ({
      category,
      disposition: SecurityActionDisposition.Allowed,
    })),
  };
}

describe('EvaluateSecurityPolicyUseCase', () => {
  let useCase: EvaluateSecurityPolicyUseCase;
  let policyService: ISecurityPolicyService;
  let settingsRepo: ISettingsRepository;

  beforeEach(() => {
    policyService = {
      evaluatePolicy: vi.fn().mockResolvedValue(createMockPolicy()),
      getEffectivePolicy: vi.fn(),
      validatePolicyFile: vi.fn(),
      getActionDisposition: vi.fn(),
    };

    settingsRepo = {
      initialize: vi.fn(),
      load: vi.fn().mockResolvedValue({
        id: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        security: { mode: SecurityMode.Advisory },
      } as unknown as Settings),
      update: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new EvaluateSecurityPolicyUseCase(policyService, settingsRepo);
  });

  it('should delegate evaluation to policy service', async () => {
    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(policyService.evaluatePolicy).toHaveBeenCalledWith('/repo');
    expect(result.mode).toBe(SecurityMode.Advisory);
    expect(result.source).toBe('shep.security.yaml');
  });

  it('should update settings with evaluation timestamp', async () => {
    await useCase.execute({ repositoryPath: '/repo' });

    expect(settingsRepo.update).toHaveBeenCalledTimes(1);
    const updatedSettings = vi.mocked(settingsRepo.update).mock.calls[0][0];
    expect(updatedSettings.security?.lastEvaluationAt).toBeDefined();
    expect(updatedSettings.security?.policySource).toBe('shep.security.yaml');
  });

  it('should still return policy even if settings update fails', async () => {
    vi.mocked(settingsRepo.update).mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute({ repositoryPath: '/repo' });

    expect(result.mode).toBe(SecurityMode.Advisory);
  });
});
