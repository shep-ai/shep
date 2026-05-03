/**
 * GitPrService Rebase & Sync Integration Tests
 *
 * Exercises syncMain, rebaseOnMain, and stash/stashPop against real temporary
 * git repositories. No mocks — verifies actual git state after each operation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { GitPrService } from '../../../../packages/core/src/infrastructure/services/git/git-pr.service.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../../../packages/core/src/application/ports/output/services/git-pr-service.interface.js';
import type { ExecFunction } from '../../../../packages/core/src/infrastructure/services/git/worktree.service.js';

const execFileRaw = promisify(execFileCb);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRealExec(): ExecFunction {
  return (file, args, options) =>
    execFileRaw(file, args, options ?? {}) as Promise<{ stdout: string; stderr: string }>;
}

const realExec = makeRealExec();

/** Run a git command in a given directory */
function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return realExec('git', args, { cwd });
}

/** Configure git user in a repo (required for commits) */
async function configureGitUser(cwd: string): Promise<void> {
  await git(cwd, ['config', 'user.email', 'test@shep.test']);
  await git(cwd, ['config', 'user.name', 'Shep Test']);
}

/**
 * Creates a bare repo + clone harness for sync/rebase tests.
 *
 * State after setup:
 * - Bare repo as local remote (origin)
 * - Clone with initial commit on main, pushed
 * - Feature branch with one commit (feature.ts), pushed
 * - HEAD on main in clone
 */
async function createHarness(): Promise<{
  bareDir: string;
  cloneDir: string;
  featureBranch: string;
}> {
  const bareDir = mkdtempSync(join(tmpdir(), 'shep-rebase-bare-'));
  await git(bareDir, ['init', '--bare']);

  const cloneDir = mkdtempSync(join(tmpdir(), 'shep-rebase-clone-'));
  await realExec('git', ['clone', bareDir, cloneDir], {});
  await configureGitUser(cloneDir);

  // Initial commit on main
  writeFileSync(join(cloneDir, 'README.md'), '# Test Repo\n');
  await git(cloneDir, ['add', 'README.md']);
  await git(cloneDir, ['commit', '-m', 'Initial commit']);
  await git(cloneDir, ['branch', '-M', 'main']);
  await git(cloneDir, ['push', '-u', 'origin', 'main']);

  // Feature branch with one commit
  const featureBranch = `feat/test-${Date.now()}`;
  await git(cloneDir, ['checkout', '-b', featureBranch]);
  writeFileSync(join(cloneDir, 'feature.ts'), '// Feature implementation\nexport {};\n');
  await git(cloneDir, ['add', 'feature.ts']);
  await git(cloneDir, ['commit', '-m', 'feat: add feature implementation']);
  await git(cloneDir, ['push', '-u', 'origin', featureBranch]);

  // Back to main
  await git(cloneDir, ['checkout', 'main']);

  return { bareDir, cloneDir, featureBranch };
}

/** Simulate upstream commits on main by committing directly in the bare repo via a temp clone */
async function addUpstreamCommit(
  bareDir: string,
  filename: string,
  content: string,
  message: string
): Promise<void> {
  const tmpClone = mkdtempSync(join(tmpdir(), 'shep-rebase-upstream-'));
  try {
    await realExec('git', ['clone', bareDir, tmpClone], {});
    await configureGitUser(tmpClone);
    await git(tmpClone, ['checkout', 'main']);
    writeFileSync(join(tmpClone, filename), content);
    await git(tmpClone, ['add', filename]);
    await git(tmpClone, ['commit', '-m', message]);
    await git(tmpClone, ['push', 'origin', 'main']);
  } finally {
    // maxRetries + retryDelay: Windows holds transient file locks (antivirus,
    // indexer, lingering git child handles) that briefly raise EBUSY/EPERM on
    // rmdir; Node's built-in retry loop turns those flakes into a single
    // visible failure only when something is genuinely stuck.
    rmSync(tmpClone, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function destroyDirs(dirs: string[]): void {
  for (const dir of dirs) {
    if (existsSync(dir)) {
      // See note above on rmSync retry options — same Windows safety net.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

/**
 * `beforeEach` timeout for the git-harness setup blocks below. Each
 * harness creation runs ~10 git subprocesses; on Windows CI runners
 * git's process spawn cost (plus filesystem latency) can easily push
 * a single setup past vitest's default 10s hook timeout. Bumping it
 * removes the flake without changing test semantics.
 */
const HARNESS_HOOK_TIMEOUT_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('GitPrService — syncMain (integration)', () => {
  let bareDir: string;
  let cloneDir: string;
  let featureBranch: string;
  let service: GitPrService;
  const dirs: string[] = [];

  beforeEach(async () => {
    const harness = await createHarness();
    bareDir = harness.bareDir;
    cloneDir = harness.cloneDir;
    featureBranch = harness.featureBranch;
    dirs.push(bareDir, cloneDir);
    service = new GitPrService(makeRealExec());
  }, HARNESS_HOOK_TIMEOUT_MS);

  afterEach(() => {
    destroyDirs(dirs);
    dirs.length = 0;
  });

  it('should fetch latest main when upstream has new commits (from feature branch)', async () => {
    // Add an upstream commit to main
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream change');

    // Currently on main, switch to feature branch
    await git(cloneDir, ['checkout', featureBranch]);

    // Get origin/main commit count before sync
    const { stdout: beforeLog } = await git(cloneDir, ['log', 'origin/main', '--oneline']);
    const beforeCount = beforeLog.trim().split('\n').length;

    // Sync main from the feature branch (uses git fetch origin main → updates origin/main)
    await service.syncMain(cloneDir, 'main');

    // After sync, origin/main should have the upstream commit
    const { stdout: afterLog } = await git(cloneDir, ['log', 'origin/main', '--oneline']);
    const afterCount = afterLog.trim().split('\n').length;
    expect(afterCount).toBe(beforeCount + 1);

    // Verify we're still on the feature branch (didn't switch)
    const { stdout: currentBranch } = await git(cloneDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(currentBranch.trim()).toBe(featureBranch);
  });

  it('should fast-forward main when on the main branch (uses pull)', async () => {
    // Add an upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream change');

    // Stay on main
    const { stdout: beforeLog } = await git(cloneDir, ['log', 'main', '--oneline']);
    const beforeCount = beforeLog.trim().split('\n').length;

    // Sync (uses git pull --ff-only since we're on main)
    await service.syncMain(cloneDir, 'main');

    const { stdout: afterLog } = await git(cloneDir, ['log', 'main', '--oneline']);
    const afterCount = afterLog.trim().split('\n').length;
    expect(afterCount).toBe(beforeCount + 1);

    // Verify the upstream file is now in the working tree
    expect(existsSync(join(cloneDir, 'upstream.ts'))).toBe(true);
  });

  it('should succeed silently when main is already up-to-date', async () => {
    // No upstream changes — sync should be a no-op
    await expect(service.syncMain(cloneDir, 'main')).resolves.toBeUndefined();

    // Verify main hasn't changed
    const { stdout: log } = await git(cloneDir, ['log', 'main', '--oneline']);
    expect(log.trim().split('\n')).toHaveLength(1); // Only initial commit
  });

  it('should throw SYNC_FAILED when on main and local main has diverged from remote', async () => {
    // Add upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream');

    // Add a local-only commit on main (creates divergence)
    // Stay on main so the pull --ff-only path is used (which detects divergence)
    writeFileSync(join(cloneDir, 'local-only.ts'), '// local\n');
    await git(cloneDir, ['add', 'local-only.ts']);
    await git(cloneDir, ['commit', '-m', 'chore: local-only commit']);

    // Sync should fail because local main diverged (uses git pull --ff-only)
    const error = await service.syncMain(cloneDir, 'main').catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.SYNC_FAILED);
  });

  it('should succeed from feature branch even when local main has diverged (fetches origin/main only)', async () => {
    // Add upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream');

    // Add a local-only commit on main (creates divergence)
    writeFileSync(join(cloneDir, 'local-only.ts'), '// local\n');
    await git(cloneDir, ['add', 'local-only.ts']);
    await git(cloneDir, ['commit', '-m', 'chore: local-only commit']);

    // Switch to feature branch — uses git fetch origin main (not main:main)
    await git(cloneDir, ['checkout', featureBranch]);

    // Sync should succeed because we only update origin/main, not local main
    await expect(service.syncMain(cloneDir, 'main')).resolves.toBeUndefined();
  });

  it('should be idempotent — calling sync twice succeeds', async () => {
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream');
    await git(cloneDir, ['checkout', featureBranch]);

    await service.syncMain(cloneDir, 'main');
    // Second call should be a no-op (already up-to-date)
    await expect(service.syncMain(cloneDir, 'main')).resolves.toBeUndefined();
  });
});

describe('GitPrService — rebaseOnMain (integration)', () => {
  let bareDir: string;
  let cloneDir: string;
  let featureBranch: string;
  let service: GitPrService;
  const dirs: string[] = [];

  beforeEach(async () => {
    const harness = await createHarness();
    bareDir = harness.bareDir;
    cloneDir = harness.cloneDir;
    featureBranch = harness.featureBranch;
    dirs.push(bareDir, cloneDir);
    service = new GitPrService(makeRealExec());
  }, HARNESS_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    // Ensure no mid-rebase state before cleanup (prevents rmSync errors)
    for (const dir of dirs) {
      if (existsSync(dir)) {
        try {
          await git(dir, ['rebase', '--abort']);
        } catch {
          // Not in a rebase — ignore
        }
      }
    }
    destroyDirs(dirs);
    dirs.length = 0;
  });

  it('should successfully rebase feature branch onto main with no conflicts', async () => {
    // Add a non-conflicting upstream commit on main
    await addUpstreamCommit(
      bareDir,
      'upstream.ts',
      '// upstream change\n',
      'chore: non-conflicting upstream change'
    );
    // Switch off main before fetching
    await git(cloneDir, ['checkout', featureBranch]);
    // Fetch origin to update origin/main (rebaseOnMain uses origin/<baseBranch>)
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // Rebase feature onto main (internally rebases onto origin/main)
    await service.rebaseOnMain(cloneDir, featureBranch, 'main');

    // Verify we're on the feature branch
    const { stdout: currentBranch } = await git(cloneDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(currentBranch.trim()).toBe(featureBranch);

    // Verify the upstream file is present (rebased on top of main)
    expect(existsSync(join(cloneDir, 'upstream.ts'))).toBe(true);

    // Verify feature file is still present
    expect(existsSync(join(cloneDir, 'feature.ts'))).toBe(true);

    // Verify linear history (feature commit is after main's latest)
    const { stdout: log } = await git(cloneDir, ['log', '--oneline']);
    const commits = log.trim().split('\n');
    expect(commits.length).toBeGreaterThanOrEqual(3); // initial + upstream + feature
  });

  it('should throw REBASE_CONFLICT when rebase encounters conflicting changes', async () => {
    // Create a conflict: modify the same file on both branches
    // First, add a commit on main that modifies feature.ts
    await addUpstreamCommit(
      bareDir,
      'feature.ts',
      '// Main branch version of feature\nexport const main = true;\n',
      'chore: modify feature.ts on main'
    );
    // Switch off main and fetch to update origin/main
    await git(cloneDir, ['checkout', featureBranch]);
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // The feature branch already has feature.ts with different content
    // Rebase should detect the conflict
    const error = await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.REBASE_CONFLICT);
    expect(error.message).toContain('feature.ts');
  });

  it('should throw GIT_ERROR when worktree has uncommitted changes', async () => {
    // Create an uncommitted modification
    writeFileSync(join(cloneDir, 'README.md'), '# Modified but not committed\n');

    const error = await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
    expect(error.message).toContain('uncommitted changes');
  });

  it('should throw BRANCH_NOT_FOUND when feature branch does not exist', async () => {
    const error = await service
      .rebaseOnMain(cloneDir, 'feat/nonexistent-branch', 'main')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.BRANCH_NOT_FOUND);
  });

  it('should leave worktree clean after aborting a conflicted rebase', async () => {
    // Create a conflict
    await addUpstreamCommit(bareDir, 'feature.ts', '// Main version\n', 'chore: conflict on main');
    await git(cloneDir, ['checkout', featureBranch]);
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // Attempt rebase — will fail with REBASE_CONFLICT
    await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch(() => {
      // Expected to fail
    });

    // Now abort the rebase
    await service.rebaseAbort(cloneDir);

    // Verify worktree is clean (no uncommitted changes)
    const { stdout: status } = await git(cloneDir, ['status', '--porcelain']);
    expect(status.trim()).toBe('');
  });

  it('should produce linear history after successful rebase', async () => {
    // Add upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream');
    await git(cloneDir, ['checkout', featureBranch]);
    await git(cloneDir, ['fetch', 'origin', 'main']);

    await service.rebaseOnMain(cloneDir, featureBranch, 'main');

    // Check that feature branch has linear history relative to main
    // (no merge commits — all commits should have exactly one parent)
    const { stdout: log } = await git(cloneDir, ['log', '--format=%P', featureBranch]);
    const parentLines = log
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    for (const parents of parentLines) {
      // Each commit should have exactly one parent (linear)
      const parentCount = parents.trim().split(/\s+/).length;
      expect(parentCount).toBeLessThanOrEqual(1);
    }
  });

  it('should succeed when feature branch is already up-to-date with main (no-op rebase)', async () => {
    // No changes to main — rebase should be a no-op and succeed
    await expect(service.rebaseOnMain(cloneDir, featureBranch, 'main')).resolves.toBeUndefined();
  });
});

describe('GitPrService — helper methods (integration)', () => {
  let bareDir: string;
  let cloneDir: string;
  let featureBranch: string;
  let service: GitPrService;
  const dirs: string[] = [];

  beforeEach(async () => {
    const harness = await createHarness();
    bareDir = harness.bareDir;
    cloneDir = harness.cloneDir;
    featureBranch = harness.featureBranch;
    dirs.push(bareDir, cloneDir);
    service = new GitPrService(makeRealExec());
  }, HARNESS_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    for (const dir of dirs) {
      if (existsSync(dir)) {
        try {
          await git(dir, ['rebase', '--abort']);
        } catch {
          // Not in a rebase — ignore
        }
      }
    }
    destroyDirs(dirs);
    dirs.length = 0;
  });

  it('getConflictedFiles should return conflicted file paths during a rebase conflict', async () => {
    // Set up a conflict
    await addUpstreamCommit(bareDir, 'feature.ts', '// Main version\n', 'chore: conflict on main');
    await git(cloneDir, ['checkout', featureBranch]);
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // Attempt rebase — will fail
    await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch(() => {
      // Expected to fail — conflict scenario
    });

    // Now check conflicted files
    const files = await service.getConflictedFiles(cloneDir);
    expect(files).toContain('feature.ts');
  });

  it('stageFiles + rebaseContinue should complete rebase after manual conflict resolution', async () => {
    // Set up a conflict
    await addUpstreamCommit(
      bareDir,
      'feature.ts',
      '// Main version\nexport const main = true;\n',
      'chore: conflict on main'
    );
    await git(cloneDir, ['checkout', featureBranch]);
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // Attempt rebase — will fail with conflict
    await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch(() => {
      // Expected to fail — conflict scenario
    });

    // Manually resolve the conflict by writing a clean file
    writeFileSync(
      join(cloneDir, 'feature.ts'),
      '// Resolved version\nexport const resolved = true;\n'
    );

    // Stage the resolved file
    await service.stageFiles(cloneDir, ['feature.ts']);

    // Continue the rebase
    await service.rebaseContinue(cloneDir);

    // Verify the rebase completed — we should be on the feature branch with clean state
    const { stdout: currentBranch } = await git(cloneDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(currentBranch.trim()).toBe(featureBranch);

    const { stdout: status } = await git(cloneDir, ['status', '--porcelain']);
    expect(status.trim()).toBe('');

    // Verify the resolved content is present
    const content = readFileSync(join(cloneDir, 'feature.ts'), 'utf-8');
    expect(content).toContain('Resolved version');
  });

  it('rebaseAbort should restore branch to pre-rebase state', async () => {
    // Get the feature branch commit hash before rebase
    await git(cloneDir, ['checkout', featureBranch]);
    const { stdout: beforeHash } = await git(cloneDir, ['rev-parse', 'HEAD']);

    // Set up a conflict
    await addUpstreamCommit(bareDir, 'feature.ts', '// Main version\n', 'chore: conflict');
    // Fetch to update origin/main
    await git(cloneDir, ['fetch', 'origin', 'main']);

    // Attempt rebase — fails
    await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch(() => {
      // Expected to fail — conflict scenario
    });

    // Abort
    await service.rebaseAbort(cloneDir);

    // Verify branch is at the original commit
    await git(cloneDir, ['checkout', featureBranch]);
    const { stdout: afterHash } = await git(cloneDir, ['rev-parse', 'HEAD']);
    expect(afterHash.trim()).toBe(beforeHash.trim());
  });
});

/* ------------------------------------------------------------------ */
/*  Stash / Stash-Rebase-Pop Integration Tests                        */
/* ------------------------------------------------------------------ */

describe('GitPrService — stash (integration)', () => {
  let bareDir: string;
  let cloneDir: string;
  let featureBranch: string;
  let service: GitPrService;
  const dirs: string[] = [];

  beforeEach(async () => {
    const harness = await createHarness();
    bareDir = harness.bareDir;
    cloneDir = harness.cloneDir;
    featureBranch = harness.featureBranch;
    dirs.push(bareDir, cloneDir);
    service = new GitPrService(makeRealExec());
  }, HARNESS_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    for (const dir of dirs) {
      if (existsSync(dir)) {
        try {
          await git(dir, ['rebase', '--abort']);
        } catch {
          // Not in a rebase — ignore
        }
      }
    }
    destroyDirs(dirs);
    dirs.length = 0;
  });

  it('should stash uncommitted changes and return true', async () => {
    await git(cloneDir, ['checkout', featureBranch]);

    // Create an uncommitted change
    writeFileSync(join(cloneDir, 'wip.ts'), '// work in progress\n');
    await git(cloneDir, ['add', 'wip.ts']);

    const didStash = await service.stash(cloneDir, 'shep-auto-stash: test');
    expect(didStash).toBe(true);

    // Working directory should be clean after stash
    const { stdout: status } = await git(cloneDir, ['status', '--porcelain']);
    expect(status.trim()).toBe('');

    // The wip file should not exist in the working tree
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(false);
  });

  it('should return false when working directory is clean', async () => {
    await git(cloneDir, ['checkout', featureBranch]);

    const didStash = await service.stash(cloneDir, 'shep-auto-stash: test');
    expect(didStash).toBe(false);
  });

  it('should include the stash message in git stash list output', async () => {
    await git(cloneDir, ['checkout', featureBranch]);

    // Create an uncommitted change
    writeFileSync(join(cloneDir, 'wip.ts'), '// work in progress\n');
    await git(cloneDir, ['add', 'wip.ts']);

    const stashMessage = `shep-auto-stash: ${featureBranch}`;
    await service.stash(cloneDir, stashMessage);

    // Verify the stash message appears in git stash list
    const { stdout: stashList } = await git(cloneDir, ['stash', 'list']);
    expect(stashList).toContain(stashMessage);
  });

  it('should stash pop and restore uncommitted changes', async () => {
    await git(cloneDir, ['checkout', featureBranch]);

    // Create uncommitted changes (both staged and unstaged file)
    writeFileSync(join(cloneDir, 'wip.ts'), '// work in progress\n');
    await git(cloneDir, ['add', 'wip.ts']);

    // Stash
    await service.stash(cloneDir, 'shep-auto-stash: test');
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(false);

    // Pop
    await service.stashPop(cloneDir);

    // Verify the file is restored
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(true);
    const content = readFileSync(join(cloneDir, 'wip.ts'), 'utf-8');
    expect(content.replace(/\r\n/g, '\n')).toBe('// work in progress\n');
  });

  it('should stash drop and discard the stash entry', async () => {
    await git(cloneDir, ['checkout', featureBranch]);

    // Create and stash a change
    writeFileSync(join(cloneDir, 'wip.ts'), '// work in progress\n');
    await git(cloneDir, ['add', 'wip.ts']);
    await service.stash(cloneDir, 'shep-auto-stash: test');

    // Verify stash exists
    const { stdout: beforeList } = await git(cloneDir, ['stash', 'list']);
    expect(beforeList.trim()).not.toBe('');

    // Drop
    await service.stashDrop(cloneDir);

    // Verify stash is empty
    const { stdout: afterList } = await git(cloneDir, ['stash', 'list']);
    expect(afterList.trim()).toBe('');
  });
});

describe('GitPrService — stash + rebase + pop flow (integration)', () => {
  let bareDir: string;
  let cloneDir: string;
  let featureBranch: string;
  let service: GitPrService;
  const dirs: string[] = [];

  beforeEach(async () => {
    const harness = await createHarness();
    bareDir = harness.bareDir;
    cloneDir = harness.cloneDir;
    featureBranch = harness.featureBranch;
    dirs.push(bareDir, cloneDir);
    service = new GitPrService(makeRealExec());
  }, HARNESS_HOOK_TIMEOUT_MS);

  afterEach(async () => {
    for (const dir of dirs) {
      if (existsSync(dir)) {
        try {
          await git(dir, ['rebase', '--abort']);
        } catch {
          // Not in a rebase — ignore
        }
      }
    }
    destroyDirs(dirs);
    dirs.length = 0;
  });

  it('should preserve uncommitted changes across a clean rebase (stash → sync → rebase → pop)', async () => {
    // Add an upstream commit on main that does NOT conflict with feature files
    await addUpstreamCommit(
      bareDir,
      'upstream.ts',
      '// upstream change\n',
      'chore: non-conflicting upstream change'
    );

    // Switch to feature branch and create uncommitted changes
    await git(cloneDir, ['checkout', featureBranch]);
    writeFileSync(join(cloneDir, 'wip.ts'), '// my uncommitted work\nexport const wip = true;\n');
    await git(cloneDir, ['add', 'wip.ts']);

    // Verify dirty state
    const hasDirty = await service.hasUncommittedChanges(cloneDir);
    expect(hasDirty).toBe(true);

    // --- Full stash-rebase-pop flow ---
    const didStash = await service.stash(cloneDir, `shep-auto-stash: ${featureBranch}`);
    expect(didStash).toBe(true);

    // Working directory should now be clean
    expect(await service.hasUncommittedChanges(cloneDir)).toBe(false);

    // Sync main
    await service.syncMain(cloneDir, 'main');

    // Rebase (should succeed — no conflicts)
    await service.rebaseOnMain(cloneDir, featureBranch, 'main');

    // Pop stash
    await service.stashPop(cloneDir);

    // --- Verify final state ---
    // Uncommitted changes restored
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(true);
    const wipContent = readFileSync(join(cloneDir, 'wip.ts'), 'utf-8');
    expect(wipContent).toContain('my uncommitted work');

    // Feature file still present
    expect(existsSync(join(cloneDir, 'feature.ts'))).toBe(true);

    // Upstream change is present (rebase applied it)
    expect(existsSync(join(cloneDir, 'upstream.ts'))).toBe(true);

    // On correct branch
    const { stdout: currentBranch } = await git(cloneDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(currentBranch.trim()).toBe(featureBranch);
  });

  it('should skip stash when working directory is clean and rebase normally', async () => {
    // Add upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream change');

    await git(cloneDir, ['checkout', featureBranch]);

    // No uncommitted changes — stash should return false
    const didStash = await service.stash(cloneDir, `shep-auto-stash: ${featureBranch}`);
    expect(didStash).toBe(false);

    // Sync + rebase as normal
    await service.syncMain(cloneDir, 'main');
    await service.rebaseOnMain(cloneDir, featureBranch, 'main');

    // Upstream change is present
    expect(existsSync(join(cloneDir, 'upstream.ts'))).toBe(true);

    // Feature file still present
    expect(existsSync(join(cloneDir, 'feature.ts'))).toBe(true);

    // Stash list should be empty (nothing was stashed)
    const { stdout: stashList } = await git(cloneDir, ['stash', 'list']);
    expect(stashList.trim()).toBe('');
  });

  it('should preserve uncommitted changes even when rebase has conflicts that are manually resolved', async () => {
    // Create a conflict on feature.ts
    await addUpstreamCommit(
      bareDir,
      'feature.ts',
      '// Main branch version\nexport const main = true;\n',
      'chore: conflicting upstream change'
    );

    // Switch to feature branch, create uncommitted work on a different file
    await git(cloneDir, ['checkout', featureBranch]);
    writeFileSync(join(cloneDir, 'wip.ts'), '// my work in progress\n');
    await git(cloneDir, ['add', 'wip.ts']);

    // Stash
    const didStash = await service.stash(cloneDir, `shep-auto-stash: ${featureBranch}`);
    expect(didStash).toBe(true);

    // Sync + attempt rebase (will conflict)
    await service.syncMain(cloneDir, 'main');
    const rebaseError = await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch((e) => e);
    expect(rebaseError).toBeInstanceOf(GitPrError);
    expect(rebaseError.code).toBe(GitPrErrorCode.REBASE_CONFLICT);

    // Manually resolve the conflict
    writeFileSync(
      join(cloneDir, 'feature.ts'),
      '// Resolved version\nexport const resolved = true;\n'
    );
    await service.stageFiles(cloneDir, ['feature.ts']);
    await service.rebaseContinue(cloneDir);

    // Pop stash — should succeed since wip.ts doesn't conflict with rebased changes
    await service.stashPop(cloneDir);

    // Verify uncommitted work is restored
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(true);
    const wipContent = readFileSync(join(cloneDir, 'wip.ts'), 'utf-8');
    expect(wipContent).toContain('my work in progress');

    // Verify resolved feature file is present
    const featureContent = readFileSync(join(cloneDir, 'feature.ts'), 'utf-8');
    expect(featureContent).toContain('Resolved version');
  });

  it('should restore uncommitted changes even after a failed rebase that is aborted', async () => {
    // Create a conflict
    await addUpstreamCommit(
      bareDir,
      'feature.ts',
      '// Main version\n',
      'chore: conflicting change'
    );

    await git(cloneDir, ['checkout', featureBranch]);
    writeFileSync(join(cloneDir, 'wip.ts'), '// important work\n');
    await git(cloneDir, ['add', 'wip.ts']);

    // Stash
    const didStash = await service.stash(cloneDir, `shep-auto-stash: ${featureBranch}`);
    expect(didStash).toBe(true);

    // Sync + attempt rebase
    await service.syncMain(cloneDir, 'main');
    await service.rebaseOnMain(cloneDir, featureBranch, 'main').catch(() => {
      // Expected — conflict
    });

    // Abort the rebase instead of resolving
    await service.rebaseAbort(cloneDir);

    // Pop stash — should succeed since rebase was aborted (back to pre-rebase state)
    await service.stashPop(cloneDir);

    // Verify uncommitted work is restored
    expect(existsSync(join(cloneDir, 'wip.ts'))).toBe(true);
    const wipContent = readFileSync(join(cloneDir, 'wip.ts'), 'utf-8');
    expect(wipContent).toContain('important work');
  });

  it('should handle unstaged modifications in stash-rebase-pop flow', async () => {
    // Add non-conflicting upstream commit
    await addUpstreamCommit(bareDir, 'upstream.ts', '// upstream\n', 'chore: upstream');

    await git(cloneDir, ['checkout', featureBranch]);

    // Create unstaged modification (modify existing tracked file, don't git add)
    writeFileSync(join(cloneDir, 'feature.ts'), '// Modified but not staged\nexport {};\n');

    // Stash
    const didStash = await service.stash(cloneDir, `shep-auto-stash: ${featureBranch}`);
    expect(didStash).toBe(true);

    // Sync + rebase
    await service.syncMain(cloneDir, 'main');
    await service.rebaseOnMain(cloneDir, featureBranch, 'main');

    // Pop
    await service.stashPop(cloneDir);

    // Verify the unstaged modification is restored
    const content = readFileSync(join(cloneDir, 'feature.ts'), 'utf-8');
    expect(content).toContain('Modified but not staged');
  });
});
