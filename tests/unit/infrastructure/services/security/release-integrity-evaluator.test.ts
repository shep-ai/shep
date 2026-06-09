/**
 * ReleaseIntegrityEvaluator Unit Tests
 *
 * Tests release pipeline integrity checks:
 * - CI workflow existence
 * - Secret configuration (no hardcoded tokens)
 * - Provenance configuration (--provenance flag)
 * - Workflow integrity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReleaseIntegrityEvaluator } from '@/infrastructure/services/security/release-integrity-evaluator.js';
import { ReleaseIntegrityCheckType, SecuritySeverity } from '@/domain/generated/output.js';
import type { ReleaseRules } from '@/domain/generated/output.js';

function createDefaultRules(overrides?: Partial<ReleaseRules>): ReleaseRules {
  return {
    requireCiOnlyPublishing: true,
    requireProvenance: true,
    checkWorkflowIntegrity: true,
    ...overrides,
  };
}

function createValidWorkflow(): string {
  return `name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.RELEASE_TOKEN }}

      - name: Run semantic-release
        env:
          GITHUB_TOKEN: \${{ secrets.RELEASE_TOKEN }}
          NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: npx semantic-release

  dev-release:
    name: Dev Release
    runs-on: ubuntu-latest
    steps:
      - name: Publish npm dev release
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: npm publish --tag dev --access public --provenance
`;
}

describe('ReleaseIntegrityEvaluator', () => {
  let evaluator: ReleaseIntegrityEvaluator;
  let tempDir: string;
  let workflowDir: string;

  beforeEach(() => {
    evaluator = new ReleaseIntegrityEvaluator();
    tempDir = mkdtempSync(join(tmpdir(), 'release-integrity-'));
    workflowDir = join(tempDir, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('valid CI workflow', () => {
    it('should return overall pass when all checks pass', () => {
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      expect(result.passed).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });
  });

  describe('missing workflow', () => {
    it('should report Critical finding when no CI workflow exists', () => {
      // Remove the workflow dir
      rmSync(workflowDir, { recursive: true, force: true });

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      expect(result.passed).toBe(false);

      const ciCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.CiOnlyPublishing
      );
      expect(ciCheck).toBeDefined();
      expect(ciCheck!.passed).toBe(false);
      expect(ciCheck!.severity).toBe(SecuritySeverity.Critical);
    });
  });

  describe('hardcoded tokens', () => {
    it('should flag hardcoded token in workflow with Critical severity', () => {
      const badWorkflow = `name: CI
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Run semantic-release
        env:
          GITHUB_TOKEN: ghp_abc123hardcodedtoken
          NPM_TOKEN: npm_abc123hardcodedtoken
        run: npx semantic-release
`;
      writeFileSync(join(workflowDir, 'ci.yml'), badWorkflow);

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      expect(result.passed).toBe(false);

      const secretCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.SecretConfiguration
      );
      expect(secretCheck).toBeDefined();
      expect(secretCheck!.passed).toBe(false);
      expect(secretCheck!.severity).toBe(SecuritySeverity.Critical);
    });

    it('should pass when tokens use secrets.* references', () => {
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      const secretCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.SecretConfiguration
      );
      expect(secretCheck).toBeDefined();
      expect(secretCheck!.passed).toBe(true);
    });
  });

  describe('provenance configuration', () => {
    it('should flag missing --provenance in publish steps with Medium severity', () => {
      const noProvenanceWorkflow = `name: CI
jobs:
  dev-release:
    runs-on: ubuntu-latest
    steps:
      - name: Publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: npm publish --tag dev --access public
`;
      writeFileSync(join(workflowDir, 'ci.yml'), noProvenanceWorkflow);

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      const provCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.ProvenanceConfiguration
      );
      expect(provCheck).toBeDefined();
      expect(provCheck!.passed).toBe(false);
      expect(provCheck!.severity).toBe(SecuritySeverity.Medium);
    });

    it('should pass when --provenance flag is present in publish steps', () => {
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      const provCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.ProvenanceConfiguration
      );
      expect(provCheck).toBeDefined();
      expect(provCheck!.passed).toBe(true);
    });

    it('should skip provenance check when requireProvenance is false', () => {
      const noProvenanceWorkflow = `name: CI
jobs:
  dev-release:
    runs-on: ubuntu-latest
    steps:
      - name: Publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: npm publish --tag dev
`;
      writeFileSync(join(workflowDir, 'ci.yml'), noProvenanceWorkflow);

      const result = evaluator.evaluate(tempDir, createDefaultRules({ requireProvenance: false }));
      const provCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.ProvenanceConfiguration
      );
      expect(provCheck).toBeUndefined();
    });
  });

  describe('workflow integrity', () => {
    it('should pass when semantic-release is configured properly', () => {
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      const integrityCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.WorkflowIntegrity
      );
      expect(integrityCheck).toBeDefined();
      expect(integrityCheck!.passed).toBe(true);
    });

    it('should skip workflow integrity check when disabled', () => {
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());

      const result = evaluator.evaluate(
        tempDir,
        createDefaultRules({ checkWorkflowIntegrity: false })
      );
      const integrityCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.WorkflowIntegrity
      );
      expect(integrityCheck).toBeUndefined();
    });
  });

  describe('all rules disabled', () => {
    it('should return pass with no checks when all rules are disabled', () => {
      const result = evaluator.evaluate(
        tempDir,
        createDefaultRules({
          requireCiOnlyPublishing: false,
          requireProvenance: false,
          checkWorkflowIntegrity: false,
        })
      );
      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(0);
    });
  });

  describe('multiple workflow files', () => {
    it('should check all YAML files in .github/workflows/', () => {
      // A valid ci.yml but a bad release.yml
      writeFileSync(join(workflowDir, 'ci.yml'), createValidWorkflow());
      const badRelease = `name: Release
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Publish
        env:
          NPM_TOKEN: hardcoded_npm_token_here
        run: npm publish
`;
      writeFileSync(join(workflowDir, 'release.yml'), badRelease);

      const result = evaluator.evaluate(tempDir, createDefaultRules());
      const secretCheck = result.checks.find(
        (c) => c.checkType === ReleaseIntegrityCheckType.SecretConfiguration
      );
      expect(secretCheck).toBeDefined();
      expect(secretCheck!.passed).toBe(false);
    });
  });
});
