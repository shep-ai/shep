/**
 * Analyze Node Unit Tests (dev-server agent)
 *
 * Covers the four routes of the analyze node with fully mocked deps:
 * 1. Cache hit    — no detection, no agent call
 * 2. Cache stale  — hash mismatch proceeds to detection
 * 3. Deterministic — detection success persists a Deterministic plan, no agent
 * 4. Agent        — structured call with schema/options, cwd resolution,
 *                   package-manager extraction heuristic, not-deployable /
 *                   no-command / thrown-error failure shaping
 * 5. Degraded     — no caller AND failed detection yields failureReason,
 *                   never a throw
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
import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';
import type { DetectDevScriptResult } from '@/infrastructure/services/deployment/detect-dev-script.js';

const TARGET_PATH = '/repos/my-app';
const CONFIG_HASH = 'hash-current';

function makeState(overrides: Partial<DevServerAgentState> = {}): DevServerAgentState {
  return {
    targetId: 'app-1',
    targetType: 'application',
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
  const detect = vi.fn().mockReturnValue(overrides.detectResult ?? DETECT_FAILURE);
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
    structuredCaller,
    computeConfigHash,
    reportAnalyzing,
    log,
  } as unknown as AnalyzeNodeDeps;

  return { deps, runPlanRepository, detect, call, computeConfigHash, reportAnalyzing, log };
}

describe('createAnalyzeNode', () => {
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

  describe('degraded with failed detection', () => {
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
