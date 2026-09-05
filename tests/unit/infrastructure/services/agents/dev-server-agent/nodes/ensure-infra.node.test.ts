/**
 * ensure_infra node — unit tests.
 *
 * Covers: all-present short-circuit (no agent call), missing→remediated,
 * missing→unremediable, executor-null degradation, executor-throw handling,
 * token-derivation matrix (builtins/paths/assignments/dedupe), the
 * runPlan-null guard, capturedLogs non-emptiness on every path, and the
 * default cross-platform probe implementation.
 */
import 'reflect-metadata';
import type * as ChildProcessModule from 'node:child_process';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `execFile` is wrapped (not replaced) so `probeBinaryDefault` keeps its real
// cross-platform behaviour while still being spyable — `vi.spyOn` cannot
// redefine a live ESM named export (Node's module namespace is frozen), so
// the wrapping has to happen at mock-factory time instead.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ChildProcessModule;
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

import * as childProcess from 'node:child_process';
import {
  RunPlanSource,
  type DevServerRunPlan,
  DeploymentTargetType,
} from '@/domain/generated/output.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  createEnsureInfraNode,
  probeBinaryDefault,
  buildInfraRemediationPrompt,
  SUGGESTED_INSTALL,
  type EnsureInfraNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/ensure-infra.node.js';

function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  const now = new Date();
  return {
    repoPath: '/repo',
    source: RunPlanSource.Deterministic,
    command: 'pnpm dev',
    cwd: '/repo',
    setupCommands: [],
    configHash: 'hash-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeState(overrides: Partial<DevServerAgentState> = {}): DevServerAgentState {
  return {
    targetId: 'app-1',
    targetType: DeploymentTargetType.Application,
    targetPath: '/repo',
    runPlan: makePlan(),
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

function makeExecutor(execute: IAgentExecutor['execute']): IAgentExecutor {
  return {
    agentType: 'claude-code' as IAgentExecutor['agentType'],
    execute,
    executeStream: vi.fn() as unknown as IAgentExecutor['executeStream'],
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function makeDeps(overrides: Partial<EnsureInfraNodeDeps> = {}): EnsureInfraNodeDeps {
  return {
    executor: null,
    log: vi.fn(),
    ...overrides,
  };
}

describe('createEnsureInfraNode', () => {
  describe('runPlan null guard', () => {
    it('fails fast with a capturedLogs entry and no probes or executor calls', async () => {
      const probeBinary = vi.fn();
      const execute = vi.fn();
      const node = createEnsureInfraNode(
        makeDeps({ probeBinary, executor: makeExecutor(execute) })
      );

      const result = await node(makeState({ runPlan: null }));

      expect(result.failureReason).toBe('No run plan available for infrastructure check');
      expect(result.capturedLogs).toBeDefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
      expect(probeBinary).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('all-present short-circuit', () => {
    it('returns infraReady true and never calls the executor', async () => {
      const probeBinary = vi.fn().mockResolvedValue(true);
      const execute = vi.fn();
      const node = createEnsureInfraNode(
        makeDeps({ probeBinary, executor: makeExecutor(execute) })
      );

      const result = await node(makeState());

      expect(result.infraReady).toBe(true);
      expect(result.failureReason).toBeUndefined();
      expect(result.capturedLogs).toBeDefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('missing → remediated', () => {
    it('calls the executor exactly once, re-probes only the missing binary, and reports infraReady', async () => {
      // packageManager='pnpm' + command 'node server.js' → required = ['pnpm', 'node'].
      const plan = makePlan({ packageManager: 'pnpm', command: 'node server.js' });
      const probeBinary = vi.fn(async (binary: string) => {
        if (binary === 'node') return true;
        // pnpm: missing on the first pass, present on the re-probe.
        return probeBinary.mock.calls.filter((c) => c[0] === 'pnpm').length > 1;
      });
      const execute = vi.fn().mockResolvedValue({ result: 'installed pnpm via corepack' });
      const log = vi.fn();
      const node = createEnsureInfraNode(
        makeDeps({ probeBinary, executor: makeExecutor(execute), log })
      );

      const result = await node(makeState({ runPlan: plan }));

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: '/repo', silent: true })
      );
      expect(result.infraReady).toBe(true);
      expect(result.failureReason).toBeUndefined();
      expect(log).toHaveBeenCalled();

      // node was probed once (initial pass) — never re-probed since it was
      // never missing.
      expect(probeBinary.mock.calls.filter((c) => c[0] === 'node')).toHaveLength(1);
      // pnpm was probed twice: once initially (missing), once on re-probe (present).
      expect(probeBinary.mock.calls.filter((c) => c[0] === 'pnpm')).toHaveLength(2);
    });
  });

  describe('missing → unremediable', () => {
    it('returns a failureReason naming the binary and a suggested install command', async () => {
      const plan = makePlan({ packageManager: 'pnpm' });
      const probeBinary = vi.fn().mockResolvedValue(false);
      const execute = vi.fn().mockResolvedValue({ result: 'tried but failed' });
      const node = createEnsureInfraNode(
        makeDeps({ probeBinary, executor: makeExecutor(execute) })
      );

      const result = await node(makeState({ runPlan: plan }));

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.infraReady).toBeUndefined();
      expect(result.failureReason).toContain('pnpm');
      expect(result.failureReason).toContain(SUGGESTED_INSTALL.pnpm);
      expect(result.degraded).toBeUndefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });
  });

  describe('executor null + missing', () => {
    it('never calls execute and returns failureReason + degraded', async () => {
      const plan = makePlan({ packageManager: 'pnpm' });
      const probeBinary = vi.fn().mockResolvedValue(false);
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      const result = await node(makeState({ runPlan: plan }));

      expect(result.failureReason).toContain('pnpm');
      expect(result.degraded).toBe(true);
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
      expect(probeBinary).toHaveBeenCalledTimes(1);
    });
  });

  describe('executor throws', () => {
    it('treats the throw as still-missing and reaches the failure path', async () => {
      const plan = makePlan({ packageManager: 'pnpm' });
      const probeBinary = vi.fn().mockResolvedValue(false);
      const execute = vi.fn().mockRejectedValue(new Error('agent crashed'));
      const node = createEnsureInfraNode(
        makeDeps({ probeBinary, executor: makeExecutor(execute) })
      );

      const result = await node(makeState({ runPlan: plan }));

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.infraReady).toBeUndefined();
      expect(result.failureReason).toContain('pnpm');
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });
  });

  describe('token derivation', () => {
    it('derives packageManager + command + setupCommands binaries, deduped and order-stable', async () => {
      const plan = makePlan({
        packageManager: 'pnpm',
        command: 'pnpm dev',
        setupCommands: ['pip install -r requirements.txt', 'ENV=1 make setup'],
      });
      const probedBinaries: string[] = [];
      const probeBinary = vi.fn(async (binary: string) => {
        probedBinaries.push(binary);
        return true;
      });
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      const result = await node(makeState({ runPlan: plan }));

      expect(probedBinaries).toEqual(['pnpm', 'pip', 'make']);
      expect(result.infraReady).toBe(true);
    });

    it('skips shell builtins, paths, and env-assignment tokens', async () => {
      const plan = makePlan({
        packageManager: undefined,
        command: 'bash run.sh',
        setupCommands: ['/usr/local/bin/foo bar', 'ENV=1 make setup', 'cd tmp'],
      });
      const probedBinaries: string[] = [];
      const probeBinary = vi.fn(async (binary: string) => {
        probedBinaries.push(binary);
        return true;
      });
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      await node(makeState({ runPlan: plan }));

      expect(probedBinaries).toEqual(['make']);
    });

    it('dedupes a binary that appears via both packageManager and command', async () => {
      const plan = makePlan({ packageManager: 'pnpm', command: 'pnpm dev' });
      const probedBinaries: string[] = [];
      const probeBinary = vi.fn(async (binary: string) => {
        probedBinaries.push(binary);
        return true;
      });
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      await node(makeState({ runPlan: plan }));

      expect(probedBinaries).toEqual(['pnpm']);
    });
  });

  describe('SUGGESTED_INSTALL', () => {
    it('has entries for pnpm, yarn, bun, and node', () => {
      expect(SUGGESTED_INSTALL.pnpm).toBe('npm install -g pnpm');
      expect(SUGGESTED_INSTALL.yarn).toBe('npm install -g yarn');
      expect(SUGGESTED_INSTALL.bun).toBe('npm install -g bun');
      expect(SUGGESTED_INSTALL.node).toBe('install Node.js from https://nodejs.org');
    });

    it('never suggests sudo or a system package manager', () => {
      for (const hint of Object.values(SUGGESTED_INSTALL)) {
        expect(hint).not.toMatch(/\bsudo\b/);
        expect(hint).not.toMatch(/\b(apt-get|apt|yum|dnf|pacman)\b/);
      }
    });
  });

  describe('non-Node runtime install hints (FR-8)', () => {
    /** Every runtime the detector registry can emit a command for. */
    const RUNTIMES = [
      { binary: 'make', command: 'make dev' },
      { binary: 'docker', command: 'docker compose up' },
      { binary: 'go', command: 'go run .' },
      { binary: 'cargo', command: 'cargo run' },
      { binary: 'deno', command: 'deno task dev' },
      { binary: 'mix', command: 'mix phx.server' },
      { binary: 'bundle', command: 'bundle exec rails server' },
      { binary: 'uv', command: 'uv run dev' },
      { binary: 'poetry', command: 'poetry run dev' },
      { binary: 'python', command: 'python manage.py runserver' },
    ] as const;

    it.each(RUNTIMES)(
      'reports a $binary-specific hint rather than the generic PATH fallback',
      async ({ binary, command }) => {
        const probeBinary = vi.fn().mockResolvedValue(false);
        const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

        const result = await node(
          makeState({ runPlan: makePlan({ command, packageManager: undefined }) })
        );

        expect(probeBinary).toHaveBeenCalledWith(binary);
        expect(result.failureReason).toContain(`'${binary}' is missing`);
        expect(result.failureReason).toContain(SUGGESTED_INSTALL[binary]);
        expect(result.failureReason).not.toContain('and ensure it is on PATH');
      }
    );

    it('reports the missing docker for a Compose plan, never node', async () => {
      const probeBinary = vi.fn().mockResolvedValue(false);
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      const result = await node(
        makeState({
          runPlan: makePlan({ command: 'docker compose up', packageManager: undefined }),
        })
      );

      expect(result.failureReason).toContain('docker');
      expect(result.failureReason).not.toContain('node');
    });

    it('skips probing a path-like command such as bin/rails', async () => {
      const probeBinary = vi.fn().mockResolvedValue(false);
      const node = createEnsureInfraNode(makeDeps({ probeBinary, executor: null }));

      const result = await node(
        makeState({
          runPlan: makePlan({
            command: 'bin/rails server',
            packageManager: undefined,
            setupCommands: [],
          }),
        })
      );

      expect(probeBinary).not.toHaveBeenCalled();
      expect(result.infraReady).toBe(true);
    });
  });

  describe('buildInfraRemediationPrompt', () => {
    it('is a pure function naming every missing tool and the platform, with user-space/non-interactive guardrails', () => {
      const prompt = buildInfraRemediationPrompt(['pnpm', 'make'], 'linux');

      expect(prompt).toContain('pnpm');
      expect(prompt).toContain('make');
      expect(prompt).toContain('linux');
      expect(prompt.toLowerCase()).toContain('non-interactive');
      expect(prompt.toLowerCase()).toContain('sudo');
      expect(prompt).toBe(buildInfraRemediationPrompt(['pnpm', 'make'], 'linux'));
    });
  });
});

describe('probeBinaryDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves true for a real, known-present binary (node)', async () => {
    await expect(probeBinaryDefault('node')).resolves.toBe(true);
  });

  it('resolves false for a binary that does not exist', async () => {
    await expect(probeBinaryDefault('definitely-not-a-real-binary-zzz-123')).resolves.toBe(false);
  });

  it('rejects invalid binary names before ever invoking execFile (injection guard)', async () => {
    await expect(probeBinaryDefault('node; rm -rf /')).resolves.toBe(false);
    await expect(probeBinaryDefault('$(whoami)')).resolves.toBe(false);
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it('invokes the platform-appropriate probe command', async () => {
    await probeBinaryDefault('node');

    if (process.platform === 'win32') {
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'where',
        ['node'],
        expect.any(Object),
        expect.any(Function)
      );
    } else {
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'sh',
        ['-c', 'command -v -- node'],
        expect.any(Object),
        expect.any(Function)
      );
    }
  });
});
