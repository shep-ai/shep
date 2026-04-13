import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import type { ApprovalGates } from '@/domain/generated/output.js';
import {
  shouldInterrupt,
  clearCompletedPhase,
  isRejectionPayload,
  buildCommitPushBlock,
  buildExecutorOptions,
  removeSpecCommitsIfNeeded,
} from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

/**
 * Helper to create ApprovalGates with defaults (all false).
 */
function makeGates(overrides: Partial<ApprovalGates> = {}): ApprovalGates {
  return {
    allowPrd: false,
    allowPlan: false,
    allowMerge: false,
    ...overrides,
  };
}

describe('shouldInterrupt', () => {
  describe('when gates is undefined', () => {
    it('returns false for any node', () => {
      expect(shouldInterrupt('requirements', undefined)).toBe(false);
      expect(shouldInterrupt('plan', undefined)).toBe(false);
      expect(shouldInterrupt('implement', undefined)).toBe(false);
      expect(shouldInterrupt('merge', undefined)).toBe(false);
    });
  });

  describe('fully autonomous (all 3 gates true)', () => {
    it('returns false for any node when all gates are true', () => {
      const gates = makeGates({ allowPrd: true, allowPlan: true, allowMerge: true });
      expect(shouldInterrupt('requirements', gates)).toBe(false);
      expect(shouldInterrupt('plan', gates)).toBe(false);
      expect(shouldInterrupt('implement', gates)).toBe(false);
      expect(shouldInterrupt('merge', gates)).toBe(false);
    });

    it('does NOT skip all interrupts when only 2 of 3 gates are true', () => {
      const gates = makeGates({ allowPrd: true, allowPlan: true, allowMerge: false });
      // merge should still interrupt
      expect(shouldInterrupt('merge', gates)).toBe(true);
    });
  });

  describe('requirements node', () => {
    it('interrupts when allowPrd is false', () => {
      const gates = makeGates({ allowPrd: false });
      expect(shouldInterrupt('requirements', gates)).toBe(true);
    });

    it('does not interrupt when allowPrd is true', () => {
      const gates = makeGates({ allowPrd: true });
      expect(shouldInterrupt('requirements', gates)).toBe(false);
    });
  });

  describe('plan node', () => {
    it('interrupts when allowPlan is false', () => {
      const gates = makeGates({ allowPlan: false });
      expect(shouldInterrupt('plan', gates)).toBe(true);
    });

    it('does not interrupt when allowPlan is true', () => {
      const gates = makeGates({ allowPlan: true });
      expect(shouldInterrupt('plan', gates)).toBe(false);
    });
  });

  describe('implement node', () => {
    it('never interrupts (implementation always proceeds to merge)', () => {
      const gates = makeGates({ allowPrd: true, allowPlan: false });
      expect(shouldInterrupt('implement', gates)).toBe(false);
    });
  });

  describe('merge node', () => {
    it('interrupts when allowMerge is false', () => {
      const gates = makeGates({ allowMerge: false });
      expect(shouldInterrupt('merge', gates)).toBe(true);
    });

    it('does not interrupt when allowMerge is true', () => {
      const gates = makeGates({ allowMerge: true });
      expect(shouldInterrupt('merge', gates)).toBe(false);
    });
  });

  describe('unknown nodes', () => {
    it('returns false for nodes without gates (e.g. analyze, research)', () => {
      const gates = makeGates();
      expect(shouldInterrupt('analyze', gates)).toBe(false);
      expect(shouldInterrupt('research', gates)).toBe(false);
    });
  });
});

describe('clearCompletedPhase', () => {
  let specDir: string;

  beforeEach(() => {
    specDir = mkdtempSync(join(tmpdir(), 'node-helpers-test-'));
  });

  it('removes the given phase from completedPhases', () => {
    const featureData = {
      status: { completedPhases: ['analyze', 'requirements', 'plan'] },
    };
    writeFileSync(join(specDir, 'feature.yaml'), yaml.dump(featureData), 'utf-8');

    clearCompletedPhase(specDir, 'requirements');

    const result = yaml.load(readFileSync(join(specDir, 'feature.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
    const status = result.status as Record<string, unknown>;
    expect(status.completedPhases).toEqual(['analyze', 'plan']);
  });

  it('is a no-op when phase is not in completedPhases', () => {
    const featureData = {
      status: { completedPhases: ['analyze'] },
    };
    writeFileSync(join(specDir, 'feature.yaml'), yaml.dump(featureData), 'utf-8');

    clearCompletedPhase(specDir, 'requirements');

    const result = yaml.load(readFileSync(join(specDir, 'feature.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
    const status = result.status as Record<string, unknown>;
    expect(status.completedPhases).toEqual(['analyze']);
  });

  it('handles missing feature.yaml gracefully', () => {
    // Should not throw
    clearCompletedPhase(specDir, 'requirements');
  });

  it('handles missing completedPhases array gracefully', () => {
    const featureData = { status: {} };
    writeFileSync(join(specDir, 'feature.yaml'), yaml.dump(featureData), 'utf-8');

    // Should not throw
    clearCompletedPhase(specDir, 'requirements');

    const result = yaml.load(readFileSync(join(specDir, 'feature.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
    const status = result.status as Record<string, unknown>;
    expect(status.completedPhases).toEqual([]);
  });
});

describe('buildCommitPushBlock', () => {
  it('should include local verification before push when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('pnpm build');
    expect(result).toContain('pnpm test');
    expect(result).toContain('pnpm lint');
    // Verification must come BEFORE push
    const verifyIndex = result.indexOf('pnpm build');
    const pushIndex = result.indexOf('git push');
    expect(verifyIndex).toBeLessThan(pushIndex);
  });

  it('should NOT include local verification when push=false', () => {
    const result = buildCommitPushBlock({
      push: false,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).not.toContain('pnpm build');
    expect(result).not.toContain('pnpm test');
    expect(result).not.toContain('pnpm lint');
  });

  it('should include commit instructions', () => {
    const result = buildCommitPushBlock({
      push: false,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git add');
    expect(result).toContain('docs(specs): update spec');
  });

  it('should prohibit git stash when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git stash');
    expect(result.toLowerCase()).toMatch(/never|do not|forbidden|prohibit/);
  });

  it('should prohibit git reset when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git reset');
  });

  it('should prohibit git checkout -- when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git checkout');
  });

  it('should prohibit git restore when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git restore');
  });

  it('should prohibit git clean when push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('git clean');
  });

  it('should instruct to proceed with commit+push if unrelated tests fail', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result.toLowerCase()).toMatch(/proceed|commit.*anyway|push.*anyway/);
  });

  it('should skip verification but still push when skipVerification=true and push=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
      skipVerification: true,
    });
    expect(result).not.toContain('pnpm build');
    expect(result).not.toContain('pnpm test');
    expect(result).not.toContain('pnpm lint');
    expect(result).toContain('git push');
  });

  it('should not include push when skipVerification=true but push=false', () => {
    const result = buildCommitPushBlock({
      push: false,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
      skipVerification: true,
    });
    expect(result).not.toContain('pnpm build');
    expect(result).not.toContain('pnpm test');
    expect(result).not.toContain('pnpm lint');
    expect(result).not.toContain('git push');
  });

  it('should include --no-verify in commit command when skipVerification=true', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
      skipVerification: true,
    });
    expect(result).toContain('--no-verify');
  });

  it('should NOT include --no-verify when skipVerification is false', () => {
    const result = buildCommitPushBlock({
      push: true,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).not.toContain('--no-verify');
  });

  it('should include Shep Bot co-author trailer instruction', () => {
    const result = buildCommitPushBlock({
      push: false,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('Shep Bot');
    expect(result).toContain('shep-agent@users.noreply.github.com');
  });

  it('should instruct NOT to include Claude co-author trailer', () => {
    const result = buildCommitPushBlock({
      push: false,
      files: ['spec.yaml'],
      commitHint: 'docs(specs): update spec',
    });
    expect(result).toContain('Do NOT include any other Co-Authored-By trailer');
  });
});

describe('isRejectionPayload', () => {
  it('returns true for valid rejection payload', () => {
    expect(isRejectionPayload({ rejected: true, feedback: 'needs more detail' })).toBe(true);
  });

  it('returns false for approval payload', () => {
    expect(isRejectionPayload({ approved: true })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRejectionPayload(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRejectionPayload(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isRejectionPayload('rejected')).toBe(false);
  });

  it('returns false when rejected is not true', () => {
    expect(isRejectionPayload({ rejected: false, feedback: 'test' })).toBe(false);
  });
});

describe('buildExecutorOptions', () => {
  afterEach(() => {
    resetSettings();
  });

  const baseState = {
    repositoryPath: '/tmp/repo',
    worktreePath: '',
    specDir: '/tmp/spec',
    featureName: 'test',
    currentNode: 'implement',
    messages: [],
    _needsReexecution: false,
  };

  it('uses default timeout (1_800_000ms) when settings are not initialized', () => {
    const options = buildExecutorOptions(baseState as any);
    expect(options.timeout).toBe(1_800_000);
  });

  it('uses default timeout when stageTimeoutMs is not set in settings', () => {
    const settings = createDefaultSettings();
    initializeSettings(settings);

    const options = buildExecutorOptions(baseState as any);
    expect(options.timeout).toBe(1_800_000);
  });

  it('uses per-stage timeout from settings when set', () => {
    const settings = createDefaultSettings();
    settings.workflow.stageTimeouts = { implementMs: 900_000 };
    initializeSettings(settings);

    const options = buildExecutorOptions(baseState as any);
    expect(options.timeout).toBe(900_000);
  });

  it('uses default timeout when per-stage timeout is not set for current node', () => {
    const settings = createDefaultSettings();
    settings.workflow.stageTimeouts = { analyzeMs: 900_000 };
    initializeSettings(settings);

    // baseState.currentNode is 'implement', not 'analyze'
    const options = buildExecutorOptions(baseState as any);
    expect(options.timeout).toBe(1_800_000);
  });

  it('uses dedicated fast-implement timeout from settings when set', () => {
    const settings = createDefaultSettings();
    settings.workflow.stageTimeouts = { fastImplementMs: 600_000 };
    initializeSettings(settings);

    const state = { ...baseState, currentNode: 'fast-implement' };
    const options = buildExecutorOptions(state as any);
    expect(options.timeout).toBe(600_000);
  });

  it('falls back to default when fast-implement timeout is not set', () => {
    const settings = createDefaultSettings();
    settings.workflow.stageTimeouts = { implementMs: 900_000 };
    initializeSettings(settings);

    const state = { ...baseState, currentNode: 'fast-implement' };
    const options = buildExecutorOptions(state as any);
    expect(options.timeout).toBe(1_800_000);
  });

  it('allows override to take precedence over settings', () => {
    const settings = createDefaultSettings();
    settings.workflow.stageTimeouts = { implementMs: 900_000 };
    initializeSettings(settings);

    const options = buildExecutorOptions(baseState as any, { timeout: 120_000 });
    expect(options.timeout).toBe(120_000);
  });

  it('uses worktreePath as cwd when available', () => {
    const state = { ...baseState, worktreePath: '/tmp/worktree' };
    const options = buildExecutorOptions(state as any);
    expect(options.cwd).toBe('/tmp/worktree');
  });

  it('uses repositoryPath as cwd when worktreePath is empty', () => {
    const options = buildExecutorOptions(baseState as any);
    expect(options.cwd).toBe('/tmp/repo');
  });
});

describe('removeSpecCommitsIfNeeded', () => {
  let repoDir: string;
  let specDir: string;
  const noopLog = {
    info: () => undefined,
    error: () => undefined,
    activate: () => undefined,
  };

  function git(cmd: string) {
    return execSync(`git ${cmd}`, { cwd: repoDir, encoding: 'utf-8' }).trim();
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'spec-commit-test-'));
    specDir = join(repoDir, 'specs', '001-test');
    mkdirSync(specDir, { recursive: true });

    // Init repo with an initial commit
    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    git('config commit.gpgsign false');
    writeFileSync(join(repoDir, 'README.md'), 'initial');
    git('add README.md');
    git('commit -m "initial"');
  });

  it('should soft-reset spec commits when commitSpecs=false', () => {
    // Simulate agent committing a spec file
    writeFileSync(join(specDir, 'spec.yaml'), 'name: test');
    git('add specs/');
    git('commit --no-verify -m "docs(specs): analyze repository"');

    const commitsBefore = git('rev-list --count HEAD');

    removeSpecCommitsIfNeeded(
      {
        commitSpecs: false,
        worktreePath: repoDir,
        repositoryPath: repoDir,
        specDir,
      } as any,
      'analyze',
      noopLog as any
    );

    const commitsAfter = git('rev-list --count HEAD');
    // The spec commit should have been undone
    expect(Number(commitsAfter)).toBe(Number(commitsBefore) - 1);

    // Spec file should still exist on disk
    const content = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
    expect(content).toBe('name: test');

    // Spec file should NOT be staged
    const staged = git('diff --cached --name-only');
    expect(staged).not.toContain('specs/');
  });

  it('should not modify commits when commitSpecs=true', () => {
    writeFileSync(join(specDir, 'spec.yaml'), 'name: test');
    git('add specs/');
    git('commit --no-verify -m "docs(specs): analyze repository"');

    const commitsBefore = git('rev-list --count HEAD');

    removeSpecCommitsIfNeeded(
      {
        commitSpecs: true,
        worktreePath: repoDir,
        repositoryPath: repoDir,
        specDir,
      } as any,
      'analyze',
      noopLog as any
    );

    const commitsAfter = git('rev-list --count HEAD');
    expect(commitsAfter).toBe(commitsBefore);
  });

  it('should not modify commits for non-spec phases', () => {
    writeFileSync(join(specDir, 'spec.yaml'), 'name: test');
    git('add specs/');
    git('commit --no-verify -m "docs(specs): analyze repository"');

    const commitsBefore = git('rev-list --count HEAD');

    removeSpecCommitsIfNeeded(
      {
        commitSpecs: false,
        worktreePath: repoDir,
        repositoryPath: repoDir,
        specDir,
      } as any,
      'implement',
      noopLog as any
    );

    const commitsAfter = git('rev-list --count HEAD');
    expect(commitsAfter).toBe(commitsBefore);
  });

  it('should be a no-op when agent did not commit spec files', () => {
    // Agent only committed non-spec files
    writeFileSync(join(repoDir, 'src.ts'), 'code');
    git('add src.ts');
    git('commit --no-verify -m "feat: add code"');

    const commitsBefore = git('rev-list --count HEAD');

    removeSpecCommitsIfNeeded(
      {
        commitSpecs: false,
        worktreePath: repoDir,
        repositoryPath: repoDir,
        specDir,
      } as any,
      'analyze',
      noopLog as any
    );

    const commitsAfter = git('rev-list --count HEAD');
    expect(commitsAfter).toBe(commitsBefore);
  });
});
