import { vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { GitPrService } from '@/infrastructure/services/git/git-pr.service.js';
import type { MergeNodeDeps } from '@/infrastructure/services/agents/feature-agent/nodes/merge/merge.node.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { DiffSummary } from '@/application/ports/output/services/git-pr-service.interface.js';
import { FAKE_PR_URL, makeMockExecutor, makeGitExecutor } from './fixtures.js';

const execFileRaw = promisify(execFileCb);

/* ------------------------------------------------------------------ */
/*  ExecFunction adapters                                              */
/* ------------------------------------------------------------------ */

/** Adapter satisfying the ExecFunction type: passes all calls to the real git binary. */
export function makeRealExec(): ExecFunction {
  return (file, args, options) =>
    execFileRaw(file, args, options ?? {}) as Promise<{ stdout: string; stderr: string }>;
}

/**
 * Returns an ExecFunction that intercepts `gh` CLI commands and returns
 * mock output, while passing all `git` commands through to the real binary.
 *
 * This enables PR-path tests to verify real local git state while simulating
 * the GitHub PR workflow without network access or a real gh CLI installation.
 */
export function makeSelectiveExec(realExec: ExecFunction): ExecFunction {
  return async (file, args, options) => {
    if (file !== 'gh') {
      return realExec(file, args, options);
    }

    const [sub, cmd] = args;

    if (sub === 'pr' && cmd === 'create') {
      return { stdout: `${FAKE_PR_URL}\n`, stderr: '' };
    }
    if (sub === 'pr' && cmd === 'merge') {
      // NOTE: This mock does NOT actually merge any git branches.
      // This is intentional: it exposes the unverified-PR-merge bug where
      // the merge node skips verifyMerge() when prUrl is set.
      return { stdout: '', stderr: '' };
    }
    if (sub === 'pr' && cmd === 'view') {
      return { stdout: '{"state":"MERGED","statusCheckRollup":[]}\n', stderr: '' };
    }
    if (sub === 'run') {
      return { stdout: '[]', stderr: '' };
    }

    return { stdout: '', stderr: '' };
  };
}

/* ------------------------------------------------------------------ */
/*  Git harness                                                        */
/* ------------------------------------------------------------------ */

export interface GitHarness {
  bareDir: string;
  cloneDir: string;
  featureBranch: string;
  runGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

/**
 * Creates an isolated git test harness with:
 * - A bare repository as the local remote
 * - A clone with origin pointing to the bare repo
 * - An initial commit on main, pushed to origin
 * - A feature branch with one commit, pushed to origin
 * - HEAD pointing at main in the clone
 */
export async function createGitHarness(): Promise<GitHarness> {
  const realExec = makeRealExec();

  const bareDir = mkdtempSync(join(tmpdir(), 'shep-merge-bare-'));
  await realExec('git', ['init', '--bare'], { cwd: bareDir });

  const cloneDir = mkdtempSync(join(tmpdir(), 'shep-merge-clone-'));
  await realExec('git', ['clone', bareDir, cloneDir], {});

  await realExec('git', ['config', 'user.email', 'test@shep.test'], { cwd: cloneDir });
  await realExec('git', ['config', 'user.name', 'Shep Test'], { cwd: cloneDir });

  writeFileSync(join(cloneDir, 'README.md'), '# Test Repo\n');
  await realExec('git', ['add', 'README.md'], { cwd: cloneDir });
  await realExec('git', ['commit', '-m', 'Initial commit'], { cwd: cloneDir });
  await realExec('git', ['branch', '-M', 'main'], { cwd: cloneDir });
  await realExec('git', ['push', '-u', 'origin', 'main'], { cwd: cloneDir });

  const featureBranch = `feat/test-${Date.now()}`;
  await realExec('git', ['checkout', '-b', featureBranch], { cwd: cloneDir });
  writeFileSync(join(cloneDir, 'feature.ts'), '// Feature implementation\nexport {};\n');
  await realExec('git', ['add', 'feature.ts'], { cwd: cloneDir });
  await realExec('git', ['commit', '-m', 'feat: add feature implementation'], { cwd: cloneDir });
  await realExec('git', ['push', '-u', 'origin', featureBranch], { cwd: cloneDir });

  await realExec('git', ['checkout', 'main'], { cwd: cloneDir });

  const runGit = (args: string[]) => realExec('git', args, { cwd: cloneDir });

  return { bareDir, cloneDir, featureBranch, runGit };
}

/**
 * Creates an isolated local-only git repo (no remote) for no-remote test scenarios.
 */
export async function createLocalOnlyHarness(): Promise<{
  repoDir: string;
  featureBranch: string;
  runGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
}> {
  const realExec = makeRealExec();
  const repoDir = mkdtempSync(join(tmpdir(), 'shep-merge-local-'));

  await realExec('git', ['init'], { cwd: repoDir });
  await realExec('git', ['config', 'user.email', 'test@shep.test'], { cwd: repoDir });
  await realExec('git', ['config', 'user.name', 'Shep Test'], { cwd: repoDir });

  writeFileSync(join(repoDir, 'README.md'), '# Test Repo\n');
  await realExec('git', ['add', 'README.md'], { cwd: repoDir });
  await realExec('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });
  await realExec('git', ['branch', '-M', 'main'], { cwd: repoDir });

  const featureBranch = `feat/test-${Date.now()}`;
  await realExec('git', ['checkout', '-b', featureBranch], { cwd: repoDir });
  writeFileSync(join(repoDir, 'feature.ts'), '// Feature implementation\nexport {};\n');
  await realExec('git', ['add', 'feature.ts'], { cwd: repoDir });
  await realExec('git', ['commit', '-m', 'feat: add feature implementation'], { cwd: repoDir });

  await realExec('git', ['checkout', 'main'], { cwd: repoDir });

  const runGit = (args: string[]) => realExec('git', args, { cwd: repoDir });

  return { repoDir, featureBranch, runGit };
}

/** Removes the harness temp directories. Called in afterEach. */
export function destroyHarness(dirs: string[]): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/*  SpecDir utility                                                    */
/* ------------------------------------------------------------------ */

/**
 * Creates a real specDir inside tempDir with a valid feature.yaml and stub YAML files.
 *
 * @param tempDir - Parent temp directory to create specDir inside
 * @param completedPhases - Phases already completed (defaults to []).
 *   Pass ['merge'] to simulate post-Phase-1 state.
 */
export function makeSpecDir(tempDir: string, completedPhases: string[] = []): string {
  const specDir = join(tempDir, 'spec');
  mkdirSync(specDir, { recursive: true });

  const phasesYaml =
    completedPhases.length > 0 ? `[${completedPhases.map((p) => `"${p}"`).join(', ')}]` : '[]';

  writeFileSync(join(specDir, 'feature.yaml'), `status:\n  completedPhases: ${phasesYaml}\n`);

  writeFileSync(
    join(specDir, 'spec.yaml'),
    [
      'name: test-feature',
      'oneLiner: test feature',
      'summary: test feature summary',
      'phase: implementation',
      'sizeEstimate: S',
      'content: test',
      'technologies: []',
      'openQuestions: []',
    ]
      .join('\n')
      .concat('\n')
  );
  writeFileSync(
    join(specDir, 'research.yaml'),
    'name: test\nsummary: test\ncontent: test\ndecisions: []\n'
  );
  writeFileSync(join(specDir, 'plan.yaml'), 'content: test\nphases: []\nfilesToCreate: []\n');
  writeFileSync(join(specDir, 'tasks.yaml'), 'tasks: []\n');

  return specDir;
}

/* ------------------------------------------------------------------ */
/*  MergeNodeDeps factory                                              */
/* ------------------------------------------------------------------ */

export interface BuildDepsOptions {
  execFn?: ExecFunction;
  executorOutput?: string;
  featureBranch?: string;
  /** When true, uses makeGitExecutor that runs real git commands instead of the mock. */
  useRealGit?: boolean;
}

export interface BuiltDeps {
  deps: MergeNodeDeps;
  featureRepository: MergeNodeDeps['featureRepository'];
  executor: IAgentExecutor;
}

/**
 * Builds MergeNodeDeps with a real GitPrService (using the provided ExecFunction)
 * and a mock or real-git IAgentExecutor. The featureRepository is fully mocked.
 */
export function buildDeps(opts: BuildDepsOptions = {}): BuiltDeps {
  const execFn = opts.execFn ?? makeRealExec();
  const gitPrService = new GitPrService(execFn);

  const featureRepository = {
    findById: vi.fn().mockResolvedValue({
      id: 'test-feature-123',
      lifecycle: 'Implementation',
      branch: opts.featureBranch ?? 'feat/test-branch',
    }),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as MergeNodeDeps['featureRepository'];

  const executor = opts.useRealGit
    ? makeGitExecutor(opts.featureBranch ?? 'feat/test-branch')
    : makeMockExecutor(opts.executorOutput ?? '[feat/test abc1234] feat: implement feature\nDone.');

  const deps: MergeNodeDeps = {
    executor,
    getDiffSummary: vi.fn().mockResolvedValue({
      filesChanged: 1,
      additions: 10,
      deletions: 2,
      commitCount: 1,
    } satisfies DiffSummary),
    hasRemote: (cwd) => gitPrService.hasRemote(cwd),
    getDefaultBranch: (cwd) => gitPrService.getDefaultBranch(cwd),
    featureRepository,
    verifyMerge: (cwd, fb, bb, pre) => gitPrService.verifyMerge(cwd, fb, bb, pre),
    revParse: (cwd, ref) => gitPrService.revParse(cwd, ref),
    localMergeSquash: (cwd, featureBranch, baseBranch, commitMessage, hasRemote) =>
      gitPrService.localMergeSquash(cwd, featureBranch, baseBranch, commitMessage, hasRemote),
    gitPrService,
    cleanupFeatureWorktreeUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as any,
  };

  return { deps, featureRepository, executor };
}

/* ------------------------------------------------------------------ */
/*  State factory                                                      */
/* ------------------------------------------------------------------ */

/**
 * Builds a minimal FeatureAgentState with all defaults filled in.
 * Override fields as needed per test scenario.
 */
export function makeState(overrides: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'test-feature-123',
    repositoryPath: '',
    specDir: '',
    worktreePath: '',
    currentNode: 'merge',
    error: null,
    approvalGates: undefined,
    messages: [],
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    _approvalAction: null,
    _rejectionFeedback: null,
    _needsReexecution: false,
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: false,
    openPr: false,
    ciFixAttempts: 0,
    ciFixHistory: [],
    ciFixStatus: 'idle',
    evidence: [],
    evidenceRetries: 0,
    model: undefined,
    resumeReason: undefined,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: undefined,
    ...overrides,
  };
}
