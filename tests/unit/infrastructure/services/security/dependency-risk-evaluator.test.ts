/**
 * DependencyRiskEvaluator Unit Tests
 *
 * Tests repository-local dependency risk evaluation:
 * - Lockfile consistency
 * - Non-registry source detection
 * - Lifecycle script detection
 * - Allowlist/denylist enforcement
 * - Version-range strictness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DependencyRiskEvaluator } from '@/infrastructure/services/security/dependency-risk-evaluator.js';
import { DependencyRiskType, SecuritySeverity } from '@/domain/generated/output.js';
import type { DependencyRules } from '@/domain/generated/output.js';

function createDefaultRules(overrides?: Partial<DependencyRules>): DependencyRules {
  return {
    checkLockfileConsistency: true,
    checkLifecycleScripts: true,
    checkNonRegistrySource: true,
    enforceStrictVersionRanges: false,
    allowlist: [],
    denylist: [],
    ...overrides,
  };
}

describe('DependencyRiskEvaluator', () => {
  let evaluator: DependencyRiskEvaluator;
  let tempDir: string;

  beforeEach(() => {
    evaluator = new DependencyRiskEvaluator();
    tempDir = mkdtempSync(join(tmpdir(), 'dep-risk-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('lockfile consistency', () => {
    it('should return zero findings when lockfile is consistent with package.json', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const lockFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LockfileInconsistency
      );
      expect(lockFindings).toHaveLength(0);
    });

    it('should report High severity finding when lockfile is missing', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const lockFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LockfileInconsistency
      );
      expect(lockFindings).toHaveLength(1);
      expect(lockFindings[0].severity).toBe(SecuritySeverity.High);
      expect(lockFindings[0].packageName).toBe('*');
      expect(lockFindings[0].remediation).toBeDefined();
    });

    it('should skip lockfile check when checkLockfileConsistency is false', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ checkLockfileConsistency: false })
      );
      const lockFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LockfileInconsistency
      );
      expect(lockFindings).toHaveLength(0);
    });
  });

  describe('non-registry source detection', () => {
    it('should flag git: dependency with Medium severity', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            'my-lib': 'git+https://github.com/user/my-lib.git',
          },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(1);
      expect(srcFindings[0].severity).toBe(SecuritySeverity.Medium);
      expect(srcFindings[0].packageName).toBe('my-lib');
    });

    it('should flag file: dependency with Medium severity', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            local: 'file:../local-pkg',
          },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(1);
      expect(srcFindings[0].packageName).toBe('local');
    });

    it('should flag link: dependency with Medium severity', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            linked: 'link:../linked-pkg',
          },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(1);
      expect(srcFindings[0].packageName).toBe('linked');
    });

    it('should not flag registry dependencies', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            lodash: '^4.17.21',
            express: '~4.18.0',
          },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(0);
    });

    it('should skip source check when checkNonRegistrySource is false', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            'my-lib': 'git+https://github.com/user/my-lib.git',
          },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ checkNonRegistrySource: false })
      );
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(0);
    });
  });

  describe('lifecycle script detection', () => {
    it('should flag package with postinstall script', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { risky: '^1.0.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      // Create node_modules/risky/package.json with lifecycle scripts
      const riskyDir = join(tempDir, 'node_modules', 'risky');
      mkdirSync(riskyDir, { recursive: true });
      writeFileSync(
        join(riskyDir, 'package.json'),
        JSON.stringify({
          name: 'risky',
          version: '1.0.0',
          scripts: {
            postinstall: 'node setup.js',
          },
        })
      );

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const scriptFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LifecycleScript
      );
      expect(scriptFindings).toHaveLength(1);
      expect(scriptFindings[0].packageName).toBe('risky');
      expect(scriptFindings[0].severity).toBe(SecuritySeverity.Medium);
      expect(scriptFindings[0].remediation).toBeDefined();
    });

    it('should flag package with preinstall script', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { danger: '^2.0.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const dangerDir = join(tempDir, 'node_modules', 'danger');
      mkdirSync(dangerDir, { recursive: true });
      writeFileSync(
        join(dangerDir, 'package.json'),
        JSON.stringify({
          name: 'danger',
          version: '2.0.0',
          scripts: {
            preinstall: 'echo hi',
          },
        })
      );

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const scriptFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LifecycleScript
      );
      expect(scriptFindings).toHaveLength(1);
      expect(scriptFindings[0].packageName).toBe('danger');
    });

    it('should not flag packages without lifecycle scripts', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { safe: '^1.0.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const safeDir = join(tempDir, 'node_modules', 'safe');
      mkdirSync(safeDir, { recursive: true });
      writeFileSync(
        join(safeDir, 'package.json'),
        JSON.stringify({
          name: 'safe',
          version: '1.0.0',
          scripts: {
            test: 'vitest',
            build: 'tsc',
          },
        })
      );

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const scriptFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LifecycleScript
      );
      expect(scriptFindings).toHaveLength(0);
    });

    it('should skip lifecycle script check when checkLifecycleScripts is false', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { risky: '^1.0.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const riskyDir = join(tempDir, 'node_modules', 'risky');
      mkdirSync(riskyDir, { recursive: true });
      writeFileSync(
        join(riskyDir, 'package.json'),
        JSON.stringify({
          name: 'risky',
          scripts: { postinstall: 'node setup.js' },
        })
      );

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ checkLifecycleScripts: false })
      );
      const scriptFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.LifecycleScript
      );
      expect(scriptFindings).toHaveLength(0);
    });
  });

  describe('denylist enforcement', () => {
    it('should flag denylisted package with Critical severity', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { 'evil-pkg': '^1.0.0', lodash: '^4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules({ denylist: ['evil-pkg'] }));
      const denyFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.DenylistViolation
      );
      expect(denyFindings).toHaveLength(1);
      expect(denyFindings[0].severity).toBe(SecuritySeverity.Critical);
      expect(denyFindings[0].packageName).toBe('evil-pkg');
    });

    it('should not flag packages not on denylist', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules({ denylist: ['evil-pkg'] }));
      const denyFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.DenylistViolation
      );
      expect(denyFindings).toHaveLength(0);
    });
  });

  describe('allowlist enforcement', () => {
    it('should flag package not on allowlist with High severity', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21', express: '^4.18.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules({ allowlist: ['lodash'] }));
      const allowFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.AllowlistViolation
      );
      expect(allowFindings).toHaveLength(1);
      expect(allowFindings[0].severity).toBe(SecuritySeverity.High);
      expect(allowFindings[0].packageName).toBe('express');
    });

    it('should not flag packages when allowlist is empty (allow all)', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules({ allowlist: [] }));
      const allowFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.AllowlistViolation
      );
      expect(allowFindings).toHaveLength(0);
    });
  });

  describe('version-range strictness', () => {
    it('should flag wildcard (*) version when strict ranges enforced', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '*' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: true })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(1);
      expect(rangeFindings[0].packageName).toBe('lodash');
      expect(rangeFindings[0].severity).toBe(SecuritySeverity.Medium);
    });

    it('should flag caret (^) version when strict ranges enforced', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: true })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(1);
      expect(rangeFindings[0].packageName).toBe('lodash');
    });

    it('should flag tilde (~) version when strict ranges enforced', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '~4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: true })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(1);
    });

    it('should flag >= or > version when strict ranges enforced', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '>=4.0.0' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: true })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(1);
    });

    it('should not flag exact version when strict ranges enforced', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '4.17.21' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: true })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(0);
    });

    it('should not check version ranges when enforceStrictVersionRanges is false', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { lodash: '*' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(
        tempDir,
        createDefaultRules({ enforceStrictVersionRanges: false })
      );
      const rangeFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.VersionRangePolicy
      );
      expect(rangeFindings).toHaveLength(0);
    });
  });

  describe('multiple dependency groups', () => {
    it('should check both dependencies and devDependencies', () => {
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { 'dep-a': 'git+https://example.com/a.git' },
          devDependencies: { 'dev-b': 'file:../local' },
        })
      );
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      const srcFindings = findings.filter(
        (f) => f.riskType === DependencyRiskType.NonRegistrySource
      );
      expect(srcFindings).toHaveLength(2);
      const names = srcFindings.map((f) => f.packageName).sort();
      expect(names).toEqual(['dep-a', 'dev-b']);
    });
  });

  describe('missing package.json', () => {
    it('should return empty findings when no package.json exists', () => {
      const findings = evaluator.evaluate(tempDir, createDefaultRules());
      expect(findings).toHaveLength(0);
    });
  });
});
