/**
 * SpecInitializerService Unit Tests
 *
 * Tests directory creation, YAML file generation, and template
 * variable substitution for the spec initialization service.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { SpecInitializerService } from '@/infrastructure/services/spec/spec-initializer.service.js';
import { SecurityPolicyValidator } from '@/infrastructure/services/security/security-policy-validator.js';
import { SECURITY_POLICY_FILENAME } from '@/infrastructure/services/security/security-policy-file-reader.js';

describe('SpecInitializerService', () => {
  let service: SpecInitializerService;
  let tempDir: string;

  beforeEach(() => {
    service = new SpecInitializerService();
    tempDir = mkdtempSync(join(tmpdir(), 'shep-spec-init-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('directory creation', () => {
    it('should create specs/NNN-SLUG/ directory', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 1, 'User authentication');

      expect(existsSync(result.specDir)).toBe(true);
      expect(result.specDir).toBe(join(tempDir, 'specs', '001-user-auth'));
    });

    it('should zero-pad feature numbers to 3 digits', async () => {
      const result = await service.initialize(tempDir, 'my-feature', 7, 'My feature');

      expect(result.featureNumber).toBe('007');
      expect(result.specDir).toContain('007-my-feature');
    });

    it('should handle double-digit feature numbers', async () => {
      const result = await service.initialize(tempDir, 'feat', 42, 'Feat');

      expect(result.featureNumber).toBe('042');
    });

    it('should handle triple-digit feature numbers', async () => {
      const result = await service.initialize(tempDir, 'feat', 123, 'Feat');

      expect(result.featureNumber).toBe('123');
    });

    it('should create parent specs/ directory if missing', async () => {
      expect(existsSync(join(tempDir, 'specs'))).toBe(false);

      await service.initialize(tempDir, 'new-feat', 1, 'New feat');

      expect(existsSync(join(tempDir, 'specs'))).toBe(true);
    });
  });

  describe('YAML file generation', () => {
    const EXPECTED_FILES = [
      'spec.yaml',
      'research.yaml',
      'plan.yaml',
      'tasks.yaml',
      'feature.yaml',
    ];

    it('should create all 5 YAML template files', async () => {
      const result = await service.initialize(tempDir, 'test-feat', 1, 'Test feat');

      const files = readdirSync(result.specDir);
      for (const expected of EXPECTED_FILES) {
        expect(files).toContain(expected);
      }
      expect(files.length).toBe(5);
    });

    it('should write non-empty content to all files', async () => {
      const result = await service.initialize(tempDir, 'test-feat', 1, 'Test feat');

      for (const filename of EXPECTED_FILES) {
        const content = readFileSync(join(result.specDir, filename), 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('template variable substitution', () => {
    it('should substitute {{FEATURE_NAME}} with slug', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 1, 'User authentication');

      const spec = readFileSync(join(result.specDir, 'spec.yaml'), 'utf-8');
      expect(spec).toContain('name: user-auth');
      expect(spec).not.toContain('{{FEATURE_NAME}}');
    });

    it('should substitute {{NNN}} with zero-padded number', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 3, 'User authentication');

      const spec = readFileSync(join(result.specDir, 'spec.yaml'), 'utf-8');
      expect(spec).toContain('number: 003');
      expect(spec).not.toContain('{{NNN}}');
    });

    it('should substitute {{FEATURE_ID}} with NNN-slug', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 5, 'User authentication');

      const feature = readFileSync(join(result.specDir, 'feature.yaml'), 'utf-8');
      expect(feature).toContain("id: '005-user-auth'");
    });

    it('should substitute {{BRANCH_NAME}} with feat/NNN-slug', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 2, 'User authentication');

      const spec = readFileSync(join(result.specDir, 'spec.yaml'), 'utf-8');
      expect(spec).toContain('branch: feat/002-user-auth');
    });

    it('should substitute {{FEATURE_NUMBER}} with raw number', async () => {
      const result = await service.initialize(tempDir, 'my-feat', 14, 'My feat');

      const feature = readFileSync(join(result.specDir, 'feature.yaml'), 'utf-8');
      expect(feature).toContain('number: 14');
    });

    it('should substitute {{DATE}} with ISO date', async () => {
      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      const research = readFileSync(join(result.specDir, 'research.yaml'), 'utf-8');
      // Should contain a date like 2026-02-12
      expect(research).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(research).not.toContain('{{DATE}}');
    });

    it('should substitute {{TIMESTAMP}} with ISO timestamp', async () => {
      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      const feature = readFileSync(join(result.specDir, 'feature.yaml'), 'utf-8');
      // Should contain a timestamp like 2026-02-12T18:35:57Z (no milliseconds)
      expect(feature).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
      expect(feature).not.toContain('{{TIMESTAMP}}');
    });

    it('should not contain any unsubstituted template variables', async () => {
      const result = await service.initialize(tempDir, 'full-check', 10, 'Full check');

      const EXPECTED_FILES = [
        'spec.yaml',
        'research.yaml',
        'plan.yaml',
        'tasks.yaml',
        'feature.yaml',
      ];
      for (const filename of EXPECTED_FILES) {
        const content = readFileSync(join(result.specDir, filename), 'utf-8');
        expect(content).not.toMatch(/\{\{[A-Z_]+\}\}/);
        expect(content).not.toMatch(/\{ \{ [A-Z_]+ \} \}/);
      }
    });
  });

  describe('number resolution from existing specs', () => {
    it('should use hint when no specs/ directory exists', async () => {
      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      expect(result.featureNumber).toBe('001');
    });

    it('should skip over existing spec numbers', async () => {
      // Pre-create specs/001-old-feature/ and specs/002-another/
      mkdirSync(join(tempDir, 'specs', '001-old-feature'), { recursive: true });
      mkdirSync(join(tempDir, 'specs', '002-another'), { recursive: true });

      const result = await service.initialize(tempDir, 'new-feat', 1, 'New feat');

      expect(result.featureNumber).toBe('003');
      expect(result.specDir).toContain('003-new-feat');
    });

    it('should use hint when it exceeds existing numbers', async () => {
      mkdirSync(join(tempDir, 'specs', '001-old'), { recursive: true });

      const result = await service.initialize(tempDir, 'feat', 5, 'Feat');

      expect(result.featureNumber).toBe('005');
    });

    it('should handle gaps in existing spec numbers', async () => {
      mkdirSync(join(tempDir, 'specs', '001-first'), { recursive: true });
      mkdirSync(join(tempDir, 'specs', '005-fifth'), { recursive: true });

      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      expect(result.featureNumber).toBe('006');
    });

    it('should ignore non-spec directories in specs/', async () => {
      mkdirSync(join(tempDir, 'specs', 'readme'), { recursive: true });
      mkdirSync(join(tempDir, 'specs', '.hidden'), { recursive: true });

      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      expect(result.featureNumber).toBe('001');
    });

    it('should handle empty specs/ directory', async () => {
      mkdirSync(join(tempDir, 'specs'), { recursive: true });

      const result = await service.initialize(tempDir, 'feat', 1, 'Feat');

      expect(result.featureNumber).toBe('001');
    });
  });

  describe('spec.yaml content', () => {
    it('should contain required YAML structure', async () => {
      const result = await service.initialize(tempDir, 'user-auth', 1, 'User authentication');

      const content = readFileSync(join(result.specDir, 'spec.yaml'), 'utf-8');
      expect(content).toContain('phase: Analysis');
      expect(content).toContain('sizeEstimate: M');
      expect(content).toContain('openQuestions:');
      expect(content).toContain('content: |');
      expect(content).toContain('## Problem Statement');
      expect(content).toContain('## Success Criteria');
    });
  });

  describe('feature.yaml content', () => {
    it('should contain status tracking structure', async () => {
      const result = await service.initialize(tempDir, 'my-feat', 1, 'My feat');

      const content = readFileSync(join(result.specDir, 'feature.yaml'), 'utf-8');
      expect(content).toContain("lifecycle: 'research'");
      expect(content).toContain("phase: 'research'");
      expect(content).toContain('completed: 0');
      expect(content).toContain("phase: 'feature-created'");
      expect(content).toContain("completedBy: 'feature-agent'");
    });
  });

  describe('fast mode', () => {
    it('should create only feature.yaml and spec.yaml when mode is fast', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 1, 'Quick fix', 'fast');

      const files = readdirSync(result.specDir);
      expect(files).toContain('feature.yaml');
      expect(files).toContain('spec.yaml');
      expect(files.length).toBe(2);
    });

    it('should include user query in spec.yaml when mode is fast', async () => {
      const result = await service.initialize(
        tempDir,
        'quick-fix',
        1,
        'Fix the typo in README',
        'fast'
      );

      const content = readFileSync(join(result.specDir, 'spec.yaml'), 'utf-8');
      expect(content).toContain('Fix the typo in README');
    });

    it('should NOT create research.yaml when mode is fast', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 1, 'Quick fix', 'fast');

      expect(existsSync(join(result.specDir, 'research.yaml'))).toBe(false);
    });

    it('should NOT create plan.yaml when mode is fast', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 1, 'Quick fix', 'fast');

      expect(existsSync(join(result.specDir, 'plan.yaml'))).toBe(false);
    });

    it('should NOT create tasks.yaml when mode is fast', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 1, 'Quick fix', 'fast');

      expect(existsSync(join(result.specDir, 'tasks.yaml'))).toBe(false);
    });

    it('should still create the spec directory', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 1, 'Quick fix', 'fast');

      expect(existsSync(result.specDir)).toBe(true);
      expect(result.specDir).toBe(join(tempDir, 'specs', '001-quick-fix'));
    });

    it('should still substitute template variables in feature.yaml', async () => {
      const result = await service.initialize(tempDir, 'quick-fix', 5, 'Quick fix', 'fast');

      const content = readFileSync(join(result.specDir, 'feature.yaml'), 'utf-8');
      expect(content).toContain("id: '005-quick-fix'");
      expect(content).toContain("name: 'quick-fix'");
      expect(content).not.toMatch(/\{\{[A-Z_]+\}\}/);
    });

    it('should create all 5 files when mode is undefined (backward compatibility)', async () => {
      const result = await service.initialize(tempDir, 'full-feat', 1, 'Full feature');

      const files = readdirSync(result.specDir);
      expect(files.length).toBe(5);
      expect(files).toContain('spec.yaml');
      expect(files).toContain('research.yaml');
      expect(files).toContain('plan.yaml');
      expect(files).toContain('tasks.yaml');
      expect(files).toContain('feature.yaml');
    });
  });

  describe('scaffoldSecurityPolicy', () => {
    it('should create shep.security.yaml at repository root', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(join(tempDir, SECURITY_POLICY_FILENAME));
    });

    it('should generate valid YAML that parses without errors', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');

      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA });
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('should pass policy validation', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>;

      const validator = new SecurityPolicyValidator();
      const result = validator.validate(parsed);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should include mode field set to Advisory', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>;

      expect(parsed.mode).toBe('Advisory');
    });

    it('should include all five action category dispositions', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>;

      const dispositions = parsed.actionDispositions as {
        category: string;
        disposition: string;
      }[];
      expect(dispositions).toHaveLength(5);

      const categories = dispositions.map((d) => d.category);
      expect(categories).toContain('DependencyInstall');
      expect(categories).toContain('PackageScriptExec');
      expect(categories).toContain('CiWorkflowModify');
      expect(categories).toContain('PublishRelease');
      expect(categories).toContain('SandboxEscalation');
    });

    it('should include dependency rules', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>;

      const rules = parsed.dependencyRules as Record<string, unknown>;
      expect(rules).toBeDefined();
      expect(rules.checkLockfileConsistency).toBe(true);
      expect(rules.checkLifecycleScripts).toBe(true);
      expect(rules.checkNonRegistrySource).toBe(true);
      expect(typeof rules.enforceStrictVersionRanges).toBe('boolean');
      expect(Array.isArray(rules.allowlist)).toBe(true);
      expect(Array.isArray(rules.denylist)).toBe(true);
    });

    it('should include release rules', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>;

      const rules = parsed.releaseRules as Record<string, unknown>;
      expect(rules).toBeDefined();
      expect(rules.requireCiOnlyPublishing).toBe(true);
      expect(rules.requireProvenance).toBe(true);
      expect(rules.checkWorkflowIntegrity).toBe(true);
    });

    it('should include YAML comments explaining sections', async () => {
      const filePath = await service.scaffoldSecurityPolicy(tempDir);
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('# Security mode controls enforcement behavior');
      expect(content).toContain('# Action dispositions control');
      expect(content).toContain('# Dependency risk rules');
      expect(content).toContain('# Release integrity rules');
    });
  });
});
