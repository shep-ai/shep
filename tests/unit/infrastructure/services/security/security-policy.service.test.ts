/**
 * SecurityPolicyService Unit Tests
 *
 * Tests for the central policy engine that evaluates, caches, and
 * queries security policy. Uses mocked dependencies for isolation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityPolicyService } from '../../../../../packages/core/src/infrastructure/services/security/security-policy.service.js';
import { SecurityPolicyFileReader } from '../../../../../packages/core/src/infrastructure/services/security/security-policy-file-reader.js';
import { SecurityPolicyValidator } from '../../../../../packages/core/src/infrastructure/services/security/security-policy-validator.js';
import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../../../packages/core/src/domain/generated/output.js';
import type {
  SupplyChainSecurityPolicy,
  SecurityConfig,
  Settings,
} from '../../../../../packages/core/src/domain/generated/output.js';
import type { ISettingsRepository } from '../../../../../packages/core/src/application/ports/output/repositories/settings.repository.interface.js';

function createMockSettingsRepo(securityConfig?: Partial<SecurityConfig>): ISettingsRepository {
  const settings = {
    id: 'test-settings',
    createdAt: new Date(),
    updatedAt: new Date(),
    security: {
      mode: SecurityMode.Advisory,
      ...securityConfig,
    },
  } as Settings;

  return {
    initialize: vi.fn(),
    load: vi.fn().mockResolvedValue(settings),
    update: vi.fn(),
  };
}

function createFullPolicy(): Partial<SupplyChainSecurityPolicy> {
  return {
    mode: SecurityMode.Enforce,
    actionDispositions: [
      {
        category: SecurityActionCategory.DependencyInstall,
        disposition: SecurityActionDisposition.ApprovalRequired,
      },
      {
        category: SecurityActionCategory.PublishRelease,
        disposition: SecurityActionDisposition.Denied,
      },
    ],
    dependencyRules: {
      checkLockfileConsistency: true,
      checkLifecycleScripts: true,
      checkNonRegistrySource: true,
      enforceStrictVersionRanges: false,
      allowlist: [],
      denylist: ['bad-pkg'],
    },
    releaseRules: {
      requireCiOnlyPublishing: true,
      requireProvenance: true,
      checkWorkflowIntegrity: true,
    },
  };
}

describe('SecurityPolicyService', () => {
  let fileReader: SecurityPolicyFileReader;
  let validator: SecurityPolicyValidator;
  let settingsRepo: ISettingsRepository;
  let service: SecurityPolicyService;

  beforeEach(() => {
    fileReader = new SecurityPolicyFileReader();
    validator = new SecurityPolicyValidator();
    settingsRepo = createMockSettingsRepo();
    service = new SecurityPolicyService(fileReader, validator, settingsRepo);
  });

  describe('evaluatePolicy()', () => {
    it('should return Advisory defaults when no policy file exists', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(null);

      const result = await service.evaluatePolicy('/repo');

      expect(result.mode).toBe(SecurityMode.Advisory);
      expect(result.source).toBe('settings-default');
      expect(result.evaluatedAt).toBeTruthy();
      // All actions should be Allowed by default
      for (const entry of result.actionDispositions) {
        expect(entry.disposition).toBe(SecurityActionDisposition.Allowed);
      }
    });

    it('should use policy file mode when present', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());

      const result = await service.evaluatePolicy('/repo');

      expect(result.mode).toBe(SecurityMode.Enforce);
      expect(result.source).toBe('shep.security.yaml');
    });

    it('should merge action dispositions from policy file', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());

      const result = await service.evaluatePolicy('/repo');

      const depInstall = result.actionDispositions.find(
        (d) => d.category === SecurityActionCategory.DependencyInstall
      );
      expect(depInstall?.disposition).toBe(SecurityActionDisposition.ApprovalRequired);

      const publish = result.actionDispositions.find(
        (d) => d.category === SecurityActionCategory.PublishRelease
      );
      expect(publish?.disposition).toBe(SecurityActionDisposition.Denied);

      // Categories not in policy file should default to Allowed
      const ciModify = result.actionDispositions.find(
        (d) => d.category === SecurityActionCategory.CiWorkflowModify
      );
      expect(ciModify?.disposition).toBe(SecurityActionDisposition.Allowed);
    });

    it('should not allow repo policy to weaken a stricter global setting', async () => {
      // Global setting denies DependencyInstall
      settingsRepo = createMockSettingsRepo({ mode: SecurityMode.Enforce });
      // We test that repo file mode=Advisory cannot override global Enforce
      vi.spyOn(fileReader, 'read').mockResolvedValue({
        mode: SecurityMode.Advisory,
      });

      service = new SecurityPolicyService(fileReader, validator, settingsRepo);
      const result = await service.evaluatePolicy('/repo');

      // Stricter mode wins: Enforce from settings > Advisory from file
      expect(result.mode).toBe(SecurityMode.Enforce);
    });

    it('should throw when policy file has validation errors', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue({
        mode: 'InvalidMode' as SecurityMode,
      });

      await expect(service.evaluatePolicy('/repo')).rejects.toThrow(/validation/i);
    });

    it('should produce deterministic output for same inputs (NFR-2)', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());

      const result1 = await service.evaluatePolicy('/repo');
      const result2 = await service.evaluatePolicy('/repo');

      expect(result1.mode).toBe(result2.mode);
      expect(result1.source).toBe(result2.source);
      expect(result1.actionDispositions).toEqual(result2.actionDispositions);
    });
  });

  describe('getEffectivePolicy()', () => {
    it('should cache the result for the same repository path', async () => {
      const readSpy = vi.spyOn(fileReader, 'read').mockResolvedValue(null);

      await service.getEffectivePolicy('/repo');
      await service.getEffectivePolicy('/repo');

      // Should only read once (cached)
      expect(readSpy).toHaveBeenCalledTimes(1);
    });

    it('should compute separately for different repository paths', async () => {
      const readSpy = vi.spyOn(fileReader, 'read').mockResolvedValue(null);

      await service.getEffectivePolicy('/repo-a');
      await service.getEffectivePolicy('/repo-b');

      expect(readSpy).toHaveBeenCalledTimes(2);
    });

    it('should return same result as evaluatePolicy for first call', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());

      const evaluated = await service.evaluatePolicy('/repo-fresh');
      // Clear any cache from evaluatePolicy
      service = new SecurityPolicyService(fileReader, validator, settingsRepo);
      const effective = await service.getEffectivePolicy('/repo-fresh');

      expect(evaluated.mode).toBe(effective.mode);
      expect(evaluated.source).toBe(effective.source);
    });
  });

  describe('validatePolicyFile()', () => {
    it('should return valid for a valid policy file', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());

      const result = await service.validatePolicyFile('/repo/shep.security.yaml');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for an invalid policy file', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue({
        mode: 'Bad' as SecurityMode,
      });

      const result = await service.validatePolicyFile('/repo/shep.security.yaml');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid with empty errors when file does not exist', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(null);

      const result = await service.validatePolicyFile('/repo/shep.security.yaml');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getActionDisposition()', () => {
    it('should return the correct disposition for a matched category', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue(createFullPolicy());
      const policy = await service.evaluatePolicy('/repo');

      const result = service.getActionDisposition(policy, SecurityActionCategory.DependencyInstall);
      expect(result).toBe(SecurityActionDisposition.ApprovalRequired);
    });

    it('should return Allowed for categories not in the policy', async () => {
      vi.spyOn(fileReader, 'read').mockResolvedValue({
        mode: SecurityMode.Advisory,
        actionDispositions: [],
      });
      const policy = await service.evaluatePolicy('/repo');

      const result = service.getActionDisposition(policy, SecurityActionCategory.SandboxEscalation);
      expect(result).toBe(SecurityActionDisposition.Allowed);
    });
  });
});
