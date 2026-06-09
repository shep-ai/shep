/**
 * Security Domain Types Tests
 *
 * Verifies that the TypeSpec-generated security types are correctly
 * exported and have the expected structure and values.
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
  SecuritySeverity,
  DependencyRiskType,
  ReleaseIntegrityCheckType,
  type SecurityEvent,
  type SupplyChainSecurityPolicy,
  type SecurityConfig,
  type Settings,
  type DependencyFinding,
  type ReleaseIntegrityResult,
  type ReleaseIntegrityCheck,
  type EffectivePolicySnapshot,
} from '../../../../packages/core/src/domain/generated/output.js';

describe('Security Domain Types', () => {
  describe('SecurityMode enum', () => {
    it('should have Disabled, Advisory, and Enforce values', () => {
      expect(SecurityMode.Disabled).toBe('Disabled');
      expect(SecurityMode.Advisory).toBe('Advisory');
      expect(SecurityMode.Enforce).toBe('Enforce');
    });

    it('should have exactly three values', () => {
      const values = Object.values(SecurityMode);
      expect(values).toHaveLength(3);
    });
  });

  describe('SecurityActionCategory enum', () => {
    it('should have all five action categories from FR-7', () => {
      expect(SecurityActionCategory.DependencyInstall).toBe('DependencyInstall');
      expect(SecurityActionCategory.PackageScriptExec).toBe('PackageScriptExec');
      expect(SecurityActionCategory.CiWorkflowModify).toBe('CiWorkflowModify');
      expect(SecurityActionCategory.PublishRelease).toBe('PublishRelease');
      expect(SecurityActionCategory.SandboxEscalation).toBe('SandboxEscalation');
    });

    it('should have exactly five values', () => {
      const values = Object.values(SecurityActionCategory);
      expect(values).toHaveLength(5);
    });
  });

  describe('SecurityActionDisposition enum', () => {
    it('should have Allowed, Denied, and ApprovalRequired values', () => {
      expect(SecurityActionDisposition.Allowed).toBe('Allowed');
      expect(SecurityActionDisposition.Denied).toBe('Denied');
      expect(SecurityActionDisposition.ApprovalRequired).toBe('ApprovalRequired');
    });

    it('should have exactly three values', () => {
      const values = Object.values(SecurityActionDisposition);
      expect(values).toHaveLength(3);
    });
  });

  describe('SecuritySeverity enum', () => {
    it('should have Low, Medium, High, and Critical values', () => {
      expect(SecuritySeverity.Low).toBe('Low');
      expect(SecuritySeverity.Medium).toBe('Medium');
      expect(SecuritySeverity.High).toBe('High');
      expect(SecuritySeverity.Critical).toBe('Critical');
    });

    it('should have exactly four values', () => {
      const values = Object.values(SecuritySeverity);
      expect(values).toHaveLength(4);
    });
  });

  describe('DependencyRiskType enum', () => {
    it('should have all risk type values', () => {
      expect(DependencyRiskType.LockfileInconsistency).toBe('LockfileInconsistency');
      expect(DependencyRiskType.NonRegistrySource).toBe('NonRegistrySource');
      expect(DependencyRiskType.LifecycleScript).toBe('LifecycleScript');
      expect(DependencyRiskType.DenylistViolation).toBe('DenylistViolation');
      expect(DependencyRiskType.AllowlistViolation).toBe('AllowlistViolation');
      expect(DependencyRiskType.VersionRangePolicy).toBe('VersionRangePolicy');
    });

    it('should have exactly six values', () => {
      const values = Object.values(DependencyRiskType);
      expect(values).toHaveLength(6);
    });
  });

  describe('ReleaseIntegrityCheckType enum', () => {
    it('should have all check type values', () => {
      expect(ReleaseIntegrityCheckType.CiOnlyPublishing).toBe('CiOnlyPublishing');
      expect(ReleaseIntegrityCheckType.SecretConfiguration).toBe('SecretConfiguration');
      expect(ReleaseIntegrityCheckType.ProvenanceConfiguration).toBe('ProvenanceConfiguration');
      expect(ReleaseIntegrityCheckType.WorkflowIntegrity).toBe('WorkflowIntegrity');
    });

    it('should have exactly four values', () => {
      const values = Object.values(ReleaseIntegrityCheckType);
      expect(values).toHaveLength(4);
    });
  });

  describe('SecurityEvent type shape', () => {
    it('should be constructible with required and optional fields', () => {
      const event: SecurityEvent = {
        id: 'test-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.High,
        category: SecurityActionCategory.DependencyInstall,
        disposition: SecurityActionDisposition.Denied,
      };

      expect(event.id).toBe('test-id');
      expect(event.repositoryPath).toBe('/path/to/repo');
      expect(event.severity).toBe(SecuritySeverity.High);
      expect(event.category).toBe(SecurityActionCategory.DependencyInstall);
      expect(event.disposition).toBe(SecurityActionDisposition.Denied);
      expect(event.featureId).toBeUndefined();
      expect(event.actor).toBeUndefined();
      expect(event.message).toBeUndefined();
      expect(event.remediationSummary).toBeUndefined();
    });

    it('should accept all optional fields', () => {
      const event: SecurityEvent = {
        id: 'test-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        repositoryPath: '/path/to/repo',
        featureId: 'feature-123',
        severity: SecuritySeverity.Critical,
        category: SecurityActionCategory.PublishRelease,
        disposition: SecurityActionDisposition.ApprovalRequired,
        actor: 'agent',
        message: 'Attempted npm publish',
        remediationSummary: 'Review publish action before approving',
      };

      expect(event.featureId).toBe('feature-123');
      expect(event.actor).toBe('agent');
      expect(event.message).toBe('Attempted npm publish');
      expect(event.remediationSummary).toBe('Review publish action before approving');
    });
  });

  describe('SupplyChainSecurityPolicy type shape', () => {
    it('should be constructible with all required fields', () => {
      const policy: SupplyChainSecurityPolicy = {
        mode: SecurityMode.Advisory,
        actionDispositions: [
          {
            category: SecurityActionCategory.DependencyInstall,
            disposition: SecurityActionDisposition.ApprovalRequired,
          },
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

      expect(policy.mode).toBe(SecurityMode.Advisory);
      expect(policy.actionDispositions).toHaveLength(1);
      expect(policy.dependencyRules.checkLockfileConsistency).toBe(true);
      expect(policy.releaseRules.requireProvenance).toBe(true);
    });
  });

  describe('DependencyFinding type shape', () => {
    it('should be constructible with required and optional fields', () => {
      const finding: DependencyFinding = {
        packageName: 'evil-pkg',
        severity: SecuritySeverity.High,
        riskType: DependencyRiskType.LifecycleScript,
        message: 'Package has postinstall script',
      };

      expect(finding.packageName).toBe('evil-pkg');
      expect(finding.version).toBeUndefined();
      expect(finding.remediation).toBeUndefined();

      const findingWithOptionals: DependencyFinding = {
        packageName: 'evil-pkg',
        version: '^1.0.0',
        severity: SecuritySeverity.High,
        riskType: DependencyRiskType.LifecycleScript,
        message: 'Package has postinstall script',
        remediation: 'Remove or audit the postinstall script',
      };

      expect(findingWithOptionals.version).toBe('^1.0.0');
      expect(findingWithOptionals.remediation).toBe('Remove or audit the postinstall script');
    });
  });

  describe('ReleaseIntegrityResult type shape', () => {
    it('should aggregate check results with overall pass/fail', () => {
      const check: ReleaseIntegrityCheck = {
        checkType: ReleaseIntegrityCheckType.CiOnlyPublishing,
        passed: true,
        message: 'Release runs in CI',
        severity: SecuritySeverity.High,
      };

      const result: ReleaseIntegrityResult = {
        checks: [check],
        passed: true,
      };

      expect(result.checks).toHaveLength(1);
      expect(result.passed).toBe(true);
    });
  });

  describe('EffectivePolicySnapshot type shape', () => {
    it('should contain resolved mode, source, timestamp, and dispositions', () => {
      const snapshot: EffectivePolicySnapshot = {
        mode: SecurityMode.Enforce,
        source: 'shep.security.yaml',
        evaluatedAt: '2026-04-05T10:00:00Z',
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
      };

      expect(snapshot.mode).toBe(SecurityMode.Enforce);
      expect(snapshot.source).toBe('shep.security.yaml');
      expect(snapshot.evaluatedAt).toBe('2026-04-05T10:00:00Z');
      expect(snapshot.actionDispositions).toHaveLength(2);
    });
  });

  describe('SecurityConfig on Settings', () => {
    it('should be an optional field on Settings', () => {
      // Settings without security config — backward compatible
      const settingsWithout: Partial<Settings> = {
        id: 'test-id',
      };
      expect(settingsWithout.security).toBeUndefined();

      // Settings with security config
      const config: SecurityConfig = {
        mode: SecurityMode.Advisory,
      };
      const settingsWith: Partial<Settings> = {
        id: 'test-id',
        security: config,
      };
      expect(settingsWith.security).toBeDefined();
      expect(settingsWith.security!.mode).toBe(SecurityMode.Advisory);
    });

    it('should have mode, lastEvaluationAt, and policySource fields', () => {
      const config: SecurityConfig = {
        mode: SecurityMode.Enforce,
        lastEvaluationAt: '2026-04-05T10:00:00Z',
        policySource: 'shep.security.yaml',
      };

      expect(config.mode).toBe(SecurityMode.Enforce);
      expect(config.lastEvaluationAt).toBe('2026-04-05T10:00:00Z');
      expect(config.policySource).toBe('shep.security.yaml');
    });

    it('should allow optional fields to be omitted', () => {
      const config: SecurityConfig = {
        mode: SecurityMode.Disabled,
      };

      expect(config.mode).toBe(SecurityMode.Disabled);
      expect(config.lastEvaluationAt).toBeUndefined();
      expect(config.policySource).toBeUndefined();
    });
  });
});
