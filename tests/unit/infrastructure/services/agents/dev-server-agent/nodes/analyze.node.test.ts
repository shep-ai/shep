/**
 * Analyze Node Unit Tests (dev-server agent)
 *
 * Covers every route of the analyze node with fully mocked deps:
 * 0. Repo config  — a valid `.shep/dev.json` outranks even a fresh cache,
 *                   carries the previous row's installStampHash forward, and
 *                   falls through (never throws) when the reader rejects it
 * 1. Cache hit    — no detection, no agent call
 * 2. Cache stale  — hash mismatch proceeds to detection, EXCEPT for a Manual
 *                   plan, which is pinned and reported stale instead
 * 3. Deterministic — a winning detector persists a Deterministic plan with
 *                   its richer fields, names the tier in the log, no agent
 * 4. Agent        — structured call with schema/options, cwd resolution,
 *                   package-manager extraction heuristic, not-deployable /
 *                   no-command / thrown-error failure shaping
 * 5. Degraded     — no caller AND every detector exhausted yields a
 *                   failureReason, never a throw
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import {
  createAnalyzeNode,
  type AnalyzeNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/analyze.node.js';
import { RUN_PLAN_ANALYSIS_SCHEMA } from '@/infrastructure/services/agents/dev-server-agent/schemas/run-plan-analysis.schema.js';
import type { DevServerAnalysis } from '@/infrastructure/services/agents/dev-server-agent/schemas/run-plan-analysis.schema.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  RunPlanSource,
  type DevServerRunPlan,
  DeploymentTargetType,
} from '@/domain/generated/output.js';
import type {
  DetectDevScriptResult,
  DetectionOutcome,
} from '@/infrastructure/services/deployment/detect-dev-script.js';
import { Ecosystem } from '@/infrastructure/services/deployment/detectors/registry.js';
import type { RepoDevConfig } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';

const TARGET_PATH = '/repos/my-app';
const CONFIG_HASH = 'hash-current';

function makeState(overrides: Partial<DevServerAgentState> = {}): DevServerAgentState {
  return {
    targetId: 'app-1',
    targetType: DeploymentTargetType.Application,
    targetPath: TARGET_PATH,
    runPlan: null,
    infraReady: false,
    depsInstalled: false,
    resultUrl: null,
    failureReason: null,
    remediationAttempts: 0,
    lastErrorTail: [],
    capturedLogs: [],
    degraded: false,
    ...overrides,
  };
}

function makeCachedPlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  return {
    repoPath: TARGET_PATH,
    source: RunPlanSource.Deterministic,
    command: 'pnpm dev',
    cwd: TARGET_PATH,
    packageManager: 'pnpm',
    setupCommands: [],
    configHash: CONFIG_HASH,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const DETECT_SUCCESS: DetectDevScriptResult = {
  success: true,
  packageManager: 'pnpm',
  scriptName: 'dev',
  command: 'pnpm dev',
  needsInstall: true,
  resolvedDir: TARGET_PATH,
};

const DETECT_FAILURE: DetectDevScriptResult = {
  success: false,
  error: 'No package.json found in /repos/my-app',
};

function makeAnalysis(overrides: Partial<DevServerAnalysis> = {}): DevServerAnalysis {
  return {
    deployable: true,
    reason: 'Django app with manage.py',
    command: 'python manage.py runserver',
    cwd: '.',
    expectedPort: 8000,
    language: 'python',
    framework: 'django',
    setupCommands: ['pip install -r requirements.txt'],
    ...overrides,
  };
}

interface DepsOverrides {
  cached?: DevServerRunPlan | null;
  detectResult?: DetectDevScriptResult;
  /** Ecosystem reported beside the detection result (detector provenance). */
  ecosystem?: Ecosystem;
  /** Makes the injected detector throw, exercising the never-throw contract. */
  detectThrows?: Error;
  /** Tier-zero `.shep/dev.json`, or an Error the reader throws. */
  repoConfig?: RepoDevConfig | Error;
  analysis?: DevServerAnalysis | Error;
  noCaller?: boolean;
  hash?: string;
}

function makeDeps(overrides: DepsOverrides = {}) {
  const runPlanRepository = {
    findByRepoPath: vi.fn().mockResolvedValue(overrides.cached ?? null),
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteByRepoPath: vi.fn().mockResolvedValue(undefined),
    stampInstallHash: vi.fn().mockResolvedValue(undefined),
  };
  const outcome: DetectionOutcome = {
    ecosystem: overrides.ecosystem ?? Ecosystem.Node,
    result: overrides.detectResult ?? DETECT_FAILURE,
  };
  const detect = vi.fn(() => {
    if (overrides.detectThrows) throw overrides.detectThrows;
    return outcome;
  });
  const readRepoConfig = vi.fn(() => {
    if (overrides.repoConfig instanceof Error) throw overrides.repoConfig;
    return overrides.repoConfig ?? null;
  });
  const call = vi.fn();
  if (overrides.analysis instanceof Error) {
    call.mockRejectedValue(overrides.analysis);
  } else {
    call.mockResolvedValue(overrides.analysis ?? makeAnalysis());
  }
  const structuredCaller = overrides.noCaller ? null : { call };
  const computeConfigHash = vi.fn().mockReturnValue(overrides.hash ?? CONFIG_HASH);
  const reportAnalyzing = vi.fn();
  const log = vi.fn();

  const deps = {
    runPlanRepository,
    detect,
    readRepoConfig,
    structuredCaller,
    computeConfigHash,
    reportAnalyzing,
    log,
  } as unknown as AnalyzeNodeDeps;

  return {
    deps,
    runPlanRepository,
    detect,
    readRepoConfig,
    call,
    computeConfigHash,
    reportAnalyzing,
    log,
  };
}

/** The persisted plan from the single expected upsert. */
function persistedPlan(runPlanRepository: { upsert: ReturnType<typeof vi.fn> }): DevServerRunPlan {
  return runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
}

function makeRepoConfig(overrides: Partial<RepoDevConfig> = {}): RepoDevConfig {
  return {
    command: 'make dev',
    cwd: TARGET_PATH,
    setupCommands: ['make deps'],
    expectedPort: 8080,
    language: 'Go',
    framework: 'Echo',
    ...overrides,
  };
}

describe('createAnalyzeNode', () => {
  describe('tier zero: committed .shep/dev.json', () => {
    it('wins over a FRESH cached plan and persists a Manual plan', async () => {
      const { deps, runPlanRepository, detect, call } = makeDeps({
        repoConfig: makeRepoConfig(),
        cached: makeCachedPlan(),
      });

      const result = await createAnalyzeNode(deps)(makeState());

      expect(detect).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
      expect(persistedPlan(runPlanRepository)).toMatchObject({
        repoPath: TARGET_PATH,
        source: RunPlanSource.Manual,
        command: 'make dev',
        cwd: TARGET_PATH,
        expectedPort: 8080,
        language: 'Go',
        framework: 'Echo',
        setupCommands: ['make deps'],
        configHash: CONFIG_HASH,
      });
      expect(result.runPlan?.command).toBe('make dev');
    });

    it('carries the previous row installStampHash forward so setup is not re-run', async () => {
      const { deps, runPlanRepository } = makeDeps({
        repoConfig: makeRepoConfig(),
        cached: makeCachedPlan({ installStampHash: 'install-stamp-1' }),
      });

      await createAnalyzeNode(deps)(makeState());

      expect(persistedPlan(runPlanRepository).installStampHash).toBe('install-stamp-1');
    });

    it('names the repo-config tier in the captured logs', async () => {
      const { deps } = makeDeps({ repoConfig: makeRepoConfig() });
      const result = await createAnalyzeNode(deps)(makeState());
      expect((result.capturedLogs ?? []).join('\n')).toContain('Run plan tier: repo config');
    });

    it('falls through to the next tier when the reader rejects the file', async () => {
      const { deps, detect, runPlanRepository } = makeDeps({
        repoConfig: undefined,
        detectResult: DETECT_SUCCESS,
      });

      await createAnalyzeNode(deps)(makeState());

      expect(detect).toHaveBeenCalledWith(TARGET_PATH);
      expect(persistedPlan(runPlanRepository).source).toBe(RunPlanSource.Deterministic);
    });

    it('never throws when the reader itself throws — falls through instead', async () => {
      const { deps, runPlanRepository } = makeDeps({
        repoConfig: new Error('EACCES: permission denied'),
        detectResult: DETECT_SUCCESS,
      });

      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.failureReason).toBeUndefined();
      expect(persistedPlan(runPlanRepository).source).toBe(RunPlanSource.Deterministic);
    });
  });

  describe('cache hit', () => {
    it('returns the cached plan without detection or agent calls', async () => {
      const cached = makeCachedPlan();
      const { deps, detect, call } = makeDeps({ cached });
      const node = createAnalyzeNode(deps);

      const result = await node(makeState());

      expect(result.runPlan).toBe(cached);
      expect(detect).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
    });

    it('does not persist anything on a cache hit', async () => {
      const { deps, runPlanRepository } = makeDeps({ cached: makeCachedPlan() });
      const node = createAnalyzeNode(deps);

      await node(makeState());

      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
    });

    it('logs the cache hit', async () => {
      const { deps, log } = makeDeps({ cached: makeCachedPlan() });
      const node = createAnalyzeNode(deps);

      const result = await node(makeState());

      const allLogs = (result.capturedLogs ?? []).join('\n');
      expect(allLogs).toContain('run plan cache hit');
      expect(log).toHaveBeenCalled();
    });

    it('sets degraded false when a structured caller is configured', async () => {
      const { deps } = makeDeps({ cached: makeCachedPlan() });
      const result = await createAnalyzeNode(deps)(makeState());
      expect(result.degraded).toBe(false);
    });

    it('sets degraded true when no structured caller is configured', async () => {
      const { deps } = makeDeps({ cached: makeCachedPlan(), noCaller: true });
      const result = await createAnalyzeNode(deps)(makeState());
      expect(result.degraded).toBe(true);
    });
  });

  describe('cache stale', () => {
    it('proceeds to detection when the cached configHash mismatches', async () => {
      const stale = makeCachedPlan({ configHash: 'hash-old' });
      const { deps, detect, runPlanRepository } = makeDeps({
        cached: stale,
        detectResult: DETECT_SUCCESS,
      });
      const node = createAnalyzeNode(deps);

      const result = await node(makeState());

      expect(detect).toHaveBeenCalledWith(TARGET_PATH);
      expect(runPlanRepository.upsert).toHaveBeenCalledTimes(1);
      expect(result.runPlan).not.toBe(stale);
      expect(result.runPlan?.configHash).toBe(CONFIG_HASH);
    });
  });

  describe('Manual plan pinning', () => {
    const pinned = (): DevServerRunPlan =>
      makeCachedPlan({
        source: RunPlanSource.Manual,
        command: 'node custom-server.js',
        configHash: 'hash-old',
      });

    it('reuses a drifted Manual plan instead of re-analyzing', async () => {
      const plan = pinned();
      const { deps, detect, call, runPlanRepository } = makeDeps({
        cached: plan,
        detectResult: DETECT_SUCCESS,
      });

      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.runPlan).toBe(plan);
      expect(detect).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
      expect(runPlanRepository.deleteByRepoPath).not.toHaveBeenCalled();
    });

    it('reports the staleness rather than acting on it', async () => {
      const { deps } = makeDeps({ cached: pinned() });
      const result = await createAnalyzeNode(deps)(makeState());

      const logs = (result.capturedLogs ?? []).join('\n');
      expect(logs).toContain('Using your pinned run plan');
      expect(logs).toContain('config files have changed since it was set');
    });

    it('reuses a current Manual plan with no staleness notice', async () => {
      const { deps } = makeDeps({ cached: pinned() as DevServerRunPlan, hash: 'hash-old' });
      const result = await createAnalyzeNode(deps)(makeState());

      const logs = (result.capturedLogs ?? []).join('\n');
      expect(logs).toContain('Using your pinned run plan');
      expect(logs).not.toContain('config files have changed');
    });

    it('still re-analyzes a drifted Deterministic plan (unchanged behaviour)', async () => {
      const { deps, detect } = makeDeps({
        cached: makeCachedPlan({ configHash: 'hash-old' }),
        detectResult: DETECT_SUCCESS,
      });

      await createAnalyzeNode(deps)(makeState());

      expect(detect).toHaveBeenCalledWith(TARGET_PATH);
    });
  });

  describe('deterministic detection', () => {
    it('persists a Deterministic plan and never calls the agent', async () => {
      const { deps, call, runPlanRepository } = makeDeps({ detectResult: DETECT_SUCCESS });
      const node = createAnalyzeNode(deps);

      const result = await node(makeState());

      expect(call).not.toHaveBeenCalled();
      expect(runPlanRepository.upsert).toHaveBeenCalledTimes(1);
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted).toMatchObject({
        repoPath: TARGET_PATH,
        source: RunPlanSource.Deterministic,
        command: 'pnpm dev',
        cwd: TARGET_PATH,
        packageManager: 'pnpm',
        setupCommands: [],
        configHash: CONFIG_HASH,
      });
      expect(result.runPlan).toBe(persisted);
    });

    it('uses the detection resolvedDir as plan cwd (monorepo subdir)', async () => {
      const subdir = resolve(TARGET_PATH, 'site');
      const { deps, runPlanRepository } = makeDeps({
        detectResult: { ...DETECT_SUCCESS, resolvedDir: subdir },
      });

      await createAnalyzeNode(deps)(makeState());

      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.cwd).toBe(subdir);
    });

    it('sets timestamps on the new plan', async () => {
      const { deps, runPlanRepository } = makeDeps({ detectResult: DETECT_SUCCESS });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.createdAt).toBeInstanceOf(Date);
      expect(persisted.updatedAt).toBeInstanceOf(Date);
    });

    it('sets degraded false when a caller is configured', async () => {
      const { deps } = makeDeps({ detectResult: DETECT_SUCCESS });
      const result = await createAnalyzeNode(deps)(makeState());
      expect(result.degraded).toBe(false);
    });

    it('sets degraded true when no caller is configured (deterministic still works)', async () => {
      const { deps } = makeDeps({ detectResult: DETECT_SUCCESS, noCaller: true });
      const result = await createAnalyzeNode(deps)(makeState());
      expect(result.degraded).toBe(true);
      expect(result.runPlan?.source).toBe(RunPlanSource.Deterministic);
      expect(result.failureReason).toBeUndefined();
    });

    it('persists the richer detector fields (language, framework, port, setup)', async () => {
      const { deps, runPlanRepository } = makeDeps({
        ecosystem: Ecosystem.Make,
        detectResult: {
          success: true,
          command: 'make dev',
          needsInstall: false,
          resolvedDir: TARGET_PATH,
          language: 'Go',
          framework: 'Echo',
          expectedPort: 8080,
          setupCommands: ['go mod download'],
          runtime: 'make',
        },
      });

      await createAnalyzeNode(deps)(makeState());

      expect(persistedPlan(runPlanRepository)).toMatchObject({
        source: RunPlanSource.Deterministic,
        command: 'make dev',
        language: 'Go',
        framework: 'Echo',
        expectedPort: 8080,
        setupCommands: ['go mod download'],
      });
    });

    it('omits optional fields the detector did not supply', async () => {
      const { deps, runPlanRepository } = makeDeps({
        ecosystem: Ecosystem.Compose,
        detectResult: {
          success: true,
          command: 'docker compose up',
          needsInstall: false,
          resolvedDir: TARGET_PATH,
        },
      });

      await createAnalyzeNode(deps)(makeState());

      const persisted = persistedPlan(runPlanRepository);
      expect(persisted.language).toBeUndefined();
      expect(persisted.framework).toBeUndefined();
      expect(persisted.expectedPort).toBeUndefined();
      expect(persisted.packageManager).toBeUndefined();
      expect(persisted.setupCommands).toEqual([]);
    });

    it('names the winning detector and tier in the deployment log', async () => {
      const { deps } = makeDeps({
        ecosystem: Ecosystem.Make,
        detectResult: {
          success: true,
          command: 'make dev',
          needsInstall: false,
          resolvedDir: TARGET_PATH,
          runtime: 'make',
        },
      });

      const result = await createAnalyzeNode(deps)(makeState());

      const logs = (result.capturedLogs ?? []).join('\n');
      expect(logs).toContain('Run plan tier: deterministic');
      expect(logs).toContain(`"${Ecosystem.Make}" detector`);
      expect(logs).toContain('make dev');
    });
  });

  describe('agent analysis', () => {
    it('passes prompt, schema, and options to the structured caller', async () => {
      const { deps, call } = makeDeps();
      await createAnalyzeNode(deps)(makeState());

      expect(call).toHaveBeenCalledTimes(1);
      const [prompt, schema, options] = call.mock.calls[0];
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('dev environment analysis agent');
      expect(schema).toBe(RUN_PLAN_ANALYSIS_SCHEMA);
      expect(options).toEqual({ silent: true, maxTurns: 3, cwd: TARGET_PATH });
    });

    it('persists an Agent plan from the analysis result', async () => {
      const { deps, runPlanRepository } = makeDeps();
      const result = await createAnalyzeNode(deps)(makeState());

      expect(runPlanRepository.upsert).toHaveBeenCalledTimes(1);
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted).toMatchObject({
        repoPath: TARGET_PATH,
        source: RunPlanSource.Agent,
        command: 'python manage.py runserver',
        cwd: TARGET_PATH,
        expectedPort: 8000,
        language: 'python',
        framework: 'django',
        setupCommands: ['pip install -r requirements.txt'],
        configHash: CONFIG_HASH,
      });
      expect(result.runPlan).toBe(persisted);
      expect(result.failureReason).toBeUndefined();
    });

    it("resolves cwd '.' to the target path", async () => {
      const { deps, runPlanRepository } = makeDeps({ analysis: makeAnalysis({ cwd: '.' }) });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.cwd).toBe(TARGET_PATH);
    });

    it('resolves a relative cwd against the target path', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({ cwd: 'apps/web' }),
      });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.cwd).toBe(resolve(TARGET_PATH, 'apps/web'));
    });

    it('extracts the package manager from an obvious "<pm> install" setup command', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({
          language: 'node',
          setupCommands: ['pnpm install'],
        }),
      });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.packageManager).toBe('pnpm');
    });

    it('leaves packageManager unset when setup commands are not node package installs', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({ setupCommands: ['pip install -r requirements.txt'] }),
      });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.packageManager).toBeUndefined();
    });

    it('leaves packageManager unset when there are no setup commands', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({ setupCommands: [] }),
      });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.packageManager).toBeUndefined();
    });

    it('omits nullable analysis fields from the plan', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({ expectedPort: null, language: null, framework: null }),
      });
      await createAnalyzeNode(deps)(makeState());
      const persisted = runPlanRepository.upsert.mock.calls[0][0] as DevServerRunPlan;
      expect(persisted.expectedPort).toBeUndefined();
      expect(persisted.language).toBeUndefined();
      expect(persisted.framework).toBeUndefined();
    });

    it('returns the agent-provided reason as failureReason when not deployable', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({
          deployable: false,
          command: null,
          reason: 'This is a CLI-only library with no server',
        }),
      });
      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.failureReason).toBe('This is a CLI-only library with no server');
      expect(result.runPlan).toBeUndefined();
      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
    });

    it('fails with a no-runnable-command reason when deployable but command is null', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: makeAnalysis({ command: null, reason: 'Static site, unclear entry' }),
      });
      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.failureReason).toBe(
        'Analysis found no runnable dev command: Static site, unclear entry'
      );
      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
    });

    it('converts a thrown agent error into a failureReason (never throws)', async () => {
      const { deps, runPlanRepository } = makeDeps({
        analysis: new Error('agent timed out'),
      });
      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.failureReason).toBe('Dev environment analysis failed: agent timed out');
      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('a detector that throws', () => {
    it('degrades to a fall-through instead of rejecting', async () => {
      const { deps, call } = makeDeps({ detectThrows: new Error('symlink loop') });

      const result = await createAnalyzeNode(deps)(makeState());

      // The agent tier still gets its turn — a broken detector must not cost
      // the user their run.
      expect(call).toHaveBeenCalledTimes(1);
      expect(result.runPlan?.source).toBe(RunPlanSource.Agent);
    });

    it('surfaces the throw as a failureReason when degraded, never as a rejection', async () => {
      const { deps } = makeDeps({ detectThrows: new Error('symlink loop'), noCaller: true });

      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.failureReason).toContain('Could not detect a dev server');
      expect(result.failureReason).toContain('symlink loop');
    });
  });

  describe('degraded with every detector exhausted', () => {
    it('starts a registry-covered repository with no agent configured', async () => {
      const { deps, call, runPlanRepository } = makeDeps({
        noCaller: true,
        ecosystem: Ecosystem.Go,
        detectResult: {
          success: true,
          command: 'go run .',
          needsInstall: false,
          resolvedDir: TARGET_PATH,
          language: 'Go',
          setupCommands: ['go mod download'],
        },
      });

      const result = await createAnalyzeNode(deps)(makeState());

      expect(call).not.toHaveBeenCalled();
      expect(result.failureReason).toBeUndefined();
      expect(result.runPlan?.command).toBe('go run .');
      expect(persistedPlan(runPlanRepository).source).toBe(RunPlanSource.Deterministic);
    });

    it('returns degraded true and an actionable failureReason without throwing', async () => {
      const { deps } = makeDeps({ noCaller: true, detectResult: DETECT_FAILURE });
      const result = await createAnalyzeNode(deps)(makeState());

      expect(result.degraded).toBe(true);
      expect(result.failureReason).toContain('Could not detect a dev server');
      expect(result.failureReason).toContain('No package.json found in /repos/my-app');
      expect(result.failureReason).toContain('no AI agent is configured');
      expect(result.failureReason).toContain('Configure an agent in Settings');
      expect(result.runPlan).toBeUndefined();
    });

    it('does not persist anything', async () => {
      const { deps, runPlanRepository } = makeDeps({ noCaller: true });
      await createAnalyzeNode(deps)(makeState());
      expect(runPlanRepository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('cross-cutting behaviour', () => {
    const routes: { name: string; overrides: DepsOverrides }[] = [
      { name: 'repo config', overrides: { repoConfig: makeRepoConfig() } },
      {
        name: 'pinned manual plan',
        overrides: { cached: makeCachedPlan({ source: RunPlanSource.Manual }) },
      },
      { name: 'cache hit', overrides: { cached: makeCachedPlan() } },
      { name: 'deterministic', overrides: { detectResult: DETECT_SUCCESS } },
      { name: 'agent success', overrides: {} },
      {
        name: 'agent not-deployable',
        overrides: { analysis: makeAnalysis({ deployable: false, command: null }) },
      },
      { name: 'agent error', overrides: { analysis: new Error('boom') } },
      { name: 'degraded failure', overrides: { noCaller: true } },
    ];

    it.each(routes)('$name — calls reportAnalyzing exactly once', async ({ overrides }) => {
      const { deps, reportAnalyzing } = makeDeps(overrides);
      await createAnalyzeNode(deps)(makeState());
      expect(reportAnalyzing).toHaveBeenCalledTimes(1);
    });

    it.each(routes)('$name — returns non-empty capturedLogs', async ({ overrides }) => {
      const { deps } = makeDeps(overrides);
      const result = await createAnalyzeNode(deps)(makeState());
      expect(result.capturedLogs).toBeDefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });

    it.each(routes)('$name — bridges every captured line to the log dep', async ({ overrides }) => {
      const { deps, log } = makeDeps(overrides);
      const result = await createAnalyzeNode(deps)(makeState());
      for (const line of result.capturedLogs!) {
        expect(log).toHaveBeenCalledWith(line);
      }
    });
  });
});
