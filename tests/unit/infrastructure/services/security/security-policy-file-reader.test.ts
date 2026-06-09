/**
 * Security Policy File Reader Unit Tests
 *
 * Tests for the file reader that parses shep.security.yaml from a repository root.
 * Verifies correct YAML parsing, missing file handling, and error messages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SecurityPolicyFileReader,
  SECURITY_POLICY_FILENAME,
} from '../../../../../packages/core/src/infrastructure/services/security/security-policy-file-reader.js';

describe('SecurityPolicyFileReader', () => {
  let tmpDir: string;
  let reader: SecurityPolicyFileReader;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'shep-security-test-'));
    reader = new SecurityPolicyFileReader();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('SECURITY_POLICY_FILENAME', () => {
    it('should be shep.security.yaml', () => {
      expect(SECURITY_POLICY_FILENAME).toBe('shep.security.yaml');
    });
  });

  describe('read()', () => {
    it('should return null when file does not exist', async () => {
      const result = await reader.read(tmpDir);
      expect(result).toBeNull();
    });

    it('should parse valid YAML and return the object', async () => {
      const policyContent = `
mode: Enforce
actionDispositions:
  - category: DependencyInstall
    disposition: ApprovalRequired
  - category: PublishRelease
    disposition: Denied
dependencyRules:
  checkLockfileConsistency: true
  checkLifecycleScripts: true
  checkNonRegistrySource: true
  enforceStrictVersionRanges: false
  allowlist: []
  denylist:
    - malicious-pkg
releaseRules:
  requireCiOnlyPublishing: true
  requireProvenance: true
  checkWorkflowIntegrity: true
`;
      writeFileSync(join(tmpDir, SECURITY_POLICY_FILENAME), policyContent, 'utf-8');

      const result = await reader.read(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.mode).toBe('Enforce');
      expect(result!.actionDispositions).toHaveLength(2);
      expect(result!.actionDispositions![0].category).toBe('DependencyInstall');
      expect(result!.actionDispositions![0].disposition).toBe('ApprovalRequired');
      expect(result!.dependencyRules!.denylist).toEqual(['malicious-pkg']);
      expect(result!.releaseRules!.requireProvenance).toBe(true);
    });

    it('should throw with actionable message on malformed YAML', async () => {
      const badYaml = `
mode: Enforce
  bad-indent: here
    broken:
`;
      writeFileSync(join(tmpDir, SECURITY_POLICY_FILENAME), badYaml, 'utf-8');

      await expect(reader.read(tmpDir)).rejects.toThrow(/shep\.security\.yaml/);
    });

    it('should handle empty YAML file by returning empty object', async () => {
      writeFileSync(join(tmpDir, SECURITY_POLICY_FILENAME), '', 'utf-8');

      const result = await reader.read(tmpDir);
      // Empty YAML file yields null/undefined from js-yaml, reader returns null
      expect(result).toBeNull();
    });

    it('should handle YAML file with only comments', async () => {
      writeFileSync(join(tmpDir, SECURITY_POLICY_FILENAME), '# just a comment\n', 'utf-8');

      const result = await reader.read(tmpDir);
      expect(result).toBeNull();
    });

    it('should use DEFAULT_SCHEMA to prevent code execution', async () => {
      // YAML tags like !!js/function should NOT be executed
      const dangerousYaml = `
mode: Advisory
evil: !!js/function 'function() { return process.exit(1); }'
`;
      writeFileSync(join(tmpDir, SECURITY_POLICY_FILENAME), dangerousYaml, 'utf-8');

      // Should throw because DEFAULT_SCHEMA rejects unknown tags
      await expect(reader.read(tmpDir)).rejects.toThrow();
    });
  });
});
