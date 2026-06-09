/**
 * Security Policy Validator Unit Tests
 *
 * Tests for validating parsed security policy objects against the expected schema.
 * Verifies field presence, enum values, contradictory rules, and input limits.
 */

import { describe, it, expect } from 'vitest';
import { SupplyChainSecurityPolicyValidator } from '../../../../../packages/core/src/infrastructure/services/security/security-policy-validator.js';
import type { SupplyChainSecurityPolicy } from '../../../../../packages/core/src/domain/generated/output.js';

function createValidPolicy(): Partial<SupplyChainSecurityPolicy> {
  return {
    mode: 'Enforce' as SupplyChainSecurityPolicy['mode'],
    actionDispositions: [
      { category: 'DependencyInstall' as never, disposition: 'ApprovalRequired' as never },
      { category: 'PublishRelease' as never, disposition: 'Denied' as never },
    ],
    dependencyRules: {
      checkLockfileConsistency: true,
      checkLifecycleScripts: true,
      checkNonRegistrySource: true,
      enforceStrictVersionRanges: false,
      allowlist: [],
      denylist: [],
    },
    releaseRules: {
      requireCiOnlyPublishing: true,
      requireProvenance: true,
      checkWorkflowIntegrity: true,
    },
  };
}

describe('SupplyChainSecurityPolicyValidator', () => {
  const validator = new SupplyChainSecurityPolicyValidator();

  describe('validate()', () => {
    it('should return valid with empty errors for a valid policy', () => {
      const result = validator.validate(createValidPolicy());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for a minimal policy with only mode', () => {
      const result = validator.validate({ mode: 'Advisory' as SupplyChainSecurityPolicy['mode'] });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should produce error referencing mode for invalid SecurityMode value', () => {
      const policy = { mode: 'Extreme' as SupplyChainSecurityPolicy['mode'] };
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/mode/i);
      expect(result.errors[0]).toMatch(/Disabled|Advisory|Enforce/);
    });

    it('should produce error for invalid action category', () => {
      const policy = createValidPolicy();
      policy.actionDispositions = [
        { category: 'InvalidCategory' as never, disposition: 'Allowed' as never },
      ];
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /category/i.test(e))).toBe(true);
    });

    it('should produce error for invalid action disposition', () => {
      const policy = createValidPolicy();
      policy.actionDispositions = [
        { category: 'DependencyInstall' as never, disposition: 'Maybe' as never },
      ];
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /disposition/i.test(e))).toBe(true);
    });

    it('should produce error for contradictory action dispositions (same category, different disposition)', () => {
      const policy = createValidPolicy();
      policy.actionDispositions = [
        { category: 'DependencyInstall' as never, disposition: 'Allowed' as never },
        { category: 'DependencyInstall' as never, disposition: 'Denied' as never },
      ];
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /conflict|contradictory|duplicate/i.test(e))).toBe(
        true
      );
    });

    it('should allow same category with same disposition (not contradictory)', () => {
      const policy = createValidPolicy();
      policy.actionDispositions = [
        { category: 'DependencyInstall' as never, disposition: 'Denied' as never },
        { category: 'DependencyInstall' as never, disposition: 'Denied' as never },
      ];
      // Duplicates (same category, same disposition) should just be a warning, not a hard error
      // But since they're not contradictory, the policy is still valid
      const result = validator.validate(policy);
      expect(result.valid).toBe(true);
    });

    it('should reject excessive number of action dispositions (>100)', () => {
      const policy = createValidPolicy();
      policy.actionDispositions = Array.from({ length: 101 }, () => ({
        category: 'DependencyInstall' as never,
        disposition: 'Allowed' as never,
      }));
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /limit|too many|exceed/i.test(e))).toBe(true);
    });

    it('should reject excessive denylist length (>100)', () => {
      const policy = createValidPolicy();
      policy.dependencyRules!.denylist = Array.from({ length: 101 }, (_, i) => `pkg-${i}`);
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /limit|too many|exceed/i.test(e))).toBe(true);
    });

    it('should validate dependencyRules boolean fields', () => {
      const policy = createValidPolicy();
      (policy.dependencyRules as Record<string, unknown>).checkLockfileConsistency = 'yes';
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /checkLockfileConsistency/i.test(e))).toBe(true);
    });

    it('should validate releaseRules boolean fields', () => {
      const policy = createValidPolicy();
      (policy.releaseRules as Record<string, unknown>).requireProvenance = 42;
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /requireProvenance/i.test(e))).toBe(true);
    });

    it('should produce error when actionDispositions is not an array', () => {
      const policy = createValidPolicy();
      (policy as Record<string, unknown>).actionDispositions = 'not-array';
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /actionDispositions/i.test(e))).toBe(true);
    });

    it('should produce error when dependencyRules is not an object', () => {
      const policy = createValidPolicy();
      (policy as Record<string, unknown>).dependencyRules = 'not-object';
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /dependencyRules/i.test(e))).toBe(true);
    });

    it('should produce error when releaseRules is not an object', () => {
      const policy = createValidPolicy();
      (policy as Record<string, unknown>).releaseRules = 123;
      const result = validator.validate(policy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /releaseRules/i.test(e))).toBe(true);
    });
  });
});
