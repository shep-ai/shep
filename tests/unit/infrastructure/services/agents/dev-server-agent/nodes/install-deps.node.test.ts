/**
 * install_deps node — unit tests (RED first, per spec 103 task-9).
 *
 * All dependencies (installer, run-plan repository, hash/path probes, setup
 * command executor, state-report hook, logger) are injected and mocked —
 * this suite never touches the filesystem or spawns a process except the two
 * real-spawn smoke tests for `execSetupCommandDefault`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RunPlanSource,
  type DevServerRunPlan,
  DeploymentTargetType,
} from '@/domain/generated/output.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  createInstallDepsNode,
  execSetupCommandDefault,
  type InstallDepsNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/install-deps.node.js';
import { computeInstallHash } from '@/infrastructure/services/deployment/config-hash.js';

function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  const now = new Date();
  return {
    repoPath: '/repo',
    source: RunPlanSource.Deterministic,
    command: 'pnpm dev',
    cwd: '/repo',
    setupCommands: [],
    configHash: 'config-hash-1',
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
    infraReady: true,
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

function makeDeps(overrides: Partial<InstallDepsNodeDeps> = {}): InstallDepsNodeDeps {
  return {
    installer: {
      install: vi.fn().mockResolvedValue({ success: true, exitCode: 0, tail: [] }),
    },
    runPlanRepository: {
      stampInstallHash: vi.fn().mockResolvedValue(undefined),
    },
    computeInstallHash: vi.fn().mockReturnValue('install-hash-1'),
    pathExists: vi.fn().mockReturnValue(true),
    execSetupCommand: vi.fn().mockResolvedValue({ success: true, tail: [] }),
    reportInstalling: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

describe('createInstallDepsNode', () => {
  describe('guard: no run plan', () => {
    it('returns a failureReason and does not touch any dependency', async () => {
      const deps = makeDeps();
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: null }));

      expect(result.failureReason).toBe('No run plan available for dependency installation');
      expect(result.capturedLogs).toBeDefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
      expect(deps.reportInstalling).not.toHaveBeenCalled();
      expect(deps.installer.install).not.toHaveBeenCalled();
      expect(deps.execSetupCommand).not.toHaveBeenCalled();
    });
  });

  describe('skip matrix', () => {
    it('skips when hash matches the stamp and node_modules is present (fresh)', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'install-hash-1' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('install-hash-1'),
        pathExists: vi.fn().mockReturnValue(true),
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(result.depsInstalled).toBe(true);
      expect(result.capturedLogs).toBeDefined();
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
      expect(deps.reportInstalling).not.toHaveBeenCalled();
      expect(deps.installer.install).not.toHaveBeenCalled();
      expect(deps.execSetupCommand).not.toHaveBeenCalled();
    });

    it('installs when node_modules is missing even if the hash matches', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'install-hash-1' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('install-hash-1'),
        pathExists: vi.fn().mockReturnValue(false),
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(deps.reportInstalling).toHaveBeenCalledTimes(1);
      expect(deps.installer.install).toHaveBeenCalledTimes(1);
      expect(result.depsInstalled).toBe(true);
    });

    it('installs when the hash is stale even if node_modules is present', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'old-hash' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        pathExists: vi.fn().mockReturnValue(true),
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(deps.reportInstalling).toHaveBeenCalledTimes(1);
      expect(deps.installer.install).toHaveBeenCalledTimes(1);
      expect(result.depsInstalled).toBe(true);
    });

    it('skips when there is no package manager, no setup commands, and the hash matches the stamp', async () => {
      const plan = makePlan({ setupCommands: [], installStampHash: 'install-hash-1' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('install-hash-1'),
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(result.depsInstalled).toBe(true);
      expect(deps.reportInstalling).not.toHaveBeenCalled();
      expect(deps.installer.install).not.toHaveBeenCalled();
      expect(deps.execSetupCommand).not.toHaveBeenCalled();
    });

    it('runs setup commands only (no installer call) when there is no package manager, setup commands exist, and there is no stamp yet', async () => {
      const plan = makePlan({ setupCommands: ['make setup'], installStampHash: undefined });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('some-hash'),
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(deps.reportInstalling).toHaveBeenCalledTimes(1);
      expect(deps.installer.install).not.toHaveBeenCalled();
      expect(deps.execSetupCommand).toHaveBeenCalledTimes(1);
      expect(deps.execSetupCommand).toHaveBeenCalledWith(
        'make setup',
        '/repo',
        expect.any(Function)
      );
      expect(result.depsInstalled).toBe(true);
    });
  });

  describe('install failure', () => {
    it('routes to failure with the exit code and preserves the error tail', async () => {
      const plan = makePlan({ packageManager: 'npm', installStampHash: 'old-hash' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        installer: {
          install: vi
            .fn()
            .mockResolvedValue({ success: false, exitCode: 1, tail: ['ERR_PNPM_FETCH'] }),
        },
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(result.failureReason).toBe('Dependency install failed (exit 1)');
      expect(result.lastErrorTail).toEqual(['ERR_PNPM_FETCH']);
      expect(result.depsInstalled).toBeUndefined();
      expect(deps.execSetupCommand).not.toHaveBeenCalled();
      expect(deps.runPlanRepository.stampInstallHash).not.toHaveBeenCalled();
    });
  });

  describe('setup command failure', () => {
    it('names the failing command in the failureReason and stops before later commands', async () => {
      const plan = makePlan({
        packageManager: 'pnpm',
        installStampHash: 'old-hash',
        setupCommands: ['make db-setup', 'make seed'],
      });
      const execSetupCommand = vi
        .fn()
        .mockResolvedValueOnce({ success: false, tail: ['permission denied'] })
        .mockResolvedValueOnce({ success: true, tail: [] });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        execSetupCommand,
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(result.failureReason).toBe('Setup command failed: make db-setup');
      expect(result.lastErrorTail).toEqual(['permission denied']);
      expect(execSetupCommand).toHaveBeenCalledTimes(1);
      expect(deps.runPlanRepository.stampInstallHash).not.toHaveBeenCalled();
    });
  });

  describe('ordering', () => {
    it('runs installer before setup commands, and setup commands sequentially', async () => {
      const callOrder: string[] = [];
      const plan = makePlan({
        packageManager: 'pnpm',
        installStampHash: 'old-hash',
        setupCommands: ['make one', 'make two'],
      });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        installer: {
          install: vi.fn().mockImplementation(async () => {
            callOrder.push('install');
            return { success: true, exitCode: 0, tail: [] };
          }),
        },
        execSetupCommand: vi.fn().mockImplementation(async (command: string) => {
          callOrder.push(command);
          return { success: true, tail: [] };
        }),
      });
      const node = createInstallDepsNode(deps);

      await node(makeState({ runPlan: plan }));

      expect(callOrder).toEqual(['install', 'make one', 'make two']);
    });
  });

  describe('stamping', () => {
    it('recomputes the hash after install and stamps the repo with plan.repoPath', async () => {
      const plan = makePlan({
        repoPath: '/repo/actual',
        cwd: '/repo/actual',
        packageManager: 'pnpm',
        installStampHash: 'old-hash',
      });
      const computeInstallHash = vi
        .fn()
        .mockReturnValueOnce('old-hash-recheck') // freshness check
        .mockReturnValueOnce('post-install-hash'); // recompute after install
      const deps = makeDeps({ computeInstallHash });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(computeInstallHash).toHaveBeenCalledTimes(2);
      expect(deps.runPlanRepository.stampInstallHash).toHaveBeenCalledWith(
        '/repo/actual',
        'post-install-hash'
      );
      expect(result.runPlan?.installStampHash).toBe('post-install-hash');
      expect(result.depsInstalled).toBe(true);
    });

    it('still succeeds when stamping throws (stamping is an optimization, not correctness)', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'old-hash' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        runPlanRepository: {
          stampInstallHash: vi.fn().mockRejectedValue(new Error('db is locked')),
        },
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));

      expect(result.depsInstalled).toBe(true);
      expect(result.failureReason).toBeUndefined();
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('db is locked'));
    });
  });

  describe('reportInstalling', () => {
    it('is called exactly once when both install and setup commands run', async () => {
      const plan = makePlan({
        packageManager: 'pnpm',
        installStampHash: 'old-hash',
        setupCommands: ['make one'],
      });
      const deps = makeDeps({ computeInstallHash: vi.fn().mockReturnValue('new-hash') });
      const node = createInstallDepsNode(deps);

      await node(makeState({ runPlan: plan }));

      expect(deps.reportInstalling).toHaveBeenCalledTimes(1);
    });
  });

  describe('capturedLogs', () => {
    it('is non-empty on the skip path', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'install-hash-1' });
      const deps = makeDeps({ computeInstallHash: vi.fn().mockReturnValue('install-hash-1') });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });

    it('is non-empty on the install path', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'old-hash' });
      const deps = makeDeps({ computeInstallHash: vi.fn().mockReturnValue('new-hash') });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });

    it('is non-empty on the failure path', async () => {
      const plan = makePlan({ packageManager: 'pnpm', installStampHash: 'old-hash' });
      const deps = makeDeps({
        computeInstallHash: vi.fn().mockReturnValue('new-hash'),
        installer: {
          install: vi.fn().mockResolvedValue({ success: false, exitCode: 1, tail: ['boom'] }),
        },
      });
      const node = createInstallDepsNode(deps);

      const result = await node(makeState({ runPlan: plan }));
      expect(result.capturedLogs!.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Non-Node plans against the REAL `computeInstallHash` and REAL fixture
 * directories — the mocked-hash suite above cannot catch the failure mode
 * that actually matters here: `computeInstallHash` used to return '' for any
 * repo without a Node lockfile, and `isFresh` short-circuits an empty hash to
 * false, so a Go/Rust/Python plan stamped a hash that could never match and
 * re-ran its full setupCommands list on EVERY start (FR-9).
 */
describe('createInstallDepsNode — non-Node plans (no packageManager)', () => {
  const ECOSYSTEMS = [
    { name: 'Go', lockfile: 'go.sum', setup: 'go mod download' },
    { name: 'Rust', lockfile: 'Cargo.lock', setup: 'cargo fetch' },
    { name: 'Python', lockfile: 'poetry.lock', setup: 'poetry install' },
  ] as const;

  const fixtures: string[] = [];

  afterEach(() => {
    while (fixtures.length > 0) {
      rmSync(fixtures.pop()!, { recursive: true, force: true });
    }
  });

  /** A fixture dir holding just the ecosystem's lockfile. */
  function makeFixture(lockfile: string, contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'shep-install-deps-'));
    fixtures.push(dir);
    writeFileSync(join(dir, lockfile), contents);
    return dir;
  }

  /** install_deps wired to the real hash function and a recording stamp. */
  function makeRealHashDeps(setupCommand: string) {
    const execSetupCommand = vi.fn().mockResolvedValue({ success: true, tail: [] });
    const stampInstallHash = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      computeInstallHash,
      // No node_modules is ever created — a non-Node plan must not be gated
      // on one, and pathExists would report false for it.
      pathExists: () => false,
      execSetupCommand,
      runPlanRepository: { stampInstallHash },
    });
    return { deps, execSetupCommand, stampInstallHash, setupCommand };
  }

  it.each(ECOSYSTEMS)(
    '$name: runs every setup command and stamps a real hash with no packageManager',
    async ({ lockfile, setup }) => {
      const dir = makeFixture(lockfile, 'lock-v1');
      const { deps, execSetupCommand, stampInstallHash } = makeRealHashDeps(setup);
      const plan = makePlan({
        repoPath: dir,
        cwd: dir,
        packageManager: undefined,
        setupCommands: [setup, 'echo done'],
      });

      const result = await createInstallDepsNode(deps)(
        makeState({ targetPath: dir, runPlan: plan })
      );

      expect(result.depsInstalled).toBe(true);
      expect(deps.installer.install).not.toHaveBeenCalled();
      expect(execSetupCommand).toHaveBeenCalledTimes(2);
      expect(stampInstallHash).toHaveBeenCalledWith(dir, computeInstallHash(dir));
      expect(computeInstallHash(dir)).not.toBe('');
    }
  );

  it.each(ECOSYSTEMS)(
    '$name: a second start with an unchanged lockfile skips the setup commands',
    async ({ lockfile, setup }) => {
      const dir = makeFixture(lockfile, 'lock-v1');
      const { deps, execSetupCommand } = makeRealHashDeps(setup);
      const plan = makePlan({
        repoPath: dir,
        cwd: dir,
        packageManager: undefined,
        setupCommands: [setup],
        installStampHash: computeInstallHash(dir),
      });

      const result = await createInstallDepsNode(deps)(
        makeState({ targetPath: dir, runPlan: plan })
      );

      expect(result.depsInstalled).toBe(true);
      expect(execSetupCommand).not.toHaveBeenCalled();
      expect(deps.reportInstalling).not.toHaveBeenCalled();
    }
  );

  it.each(ECOSYSTEMS)(
    '$name: changing the lockfile re-runs the setup commands',
    async ({ lockfile, setup }) => {
      const dir = makeFixture(lockfile, 'lock-v1');
      const stampedBefore = computeInstallHash(dir);
      writeFileSync(join(dir, lockfile), 'lock-v2');

      const { deps, execSetupCommand, stampInstallHash } = makeRealHashDeps(setup);
      const plan = makePlan({
        repoPath: dir,
        cwd: dir,
        packageManager: undefined,
        setupCommands: [setup],
        installStampHash: stampedBefore,
      });

      await createInstallDepsNode(deps)(makeState({ targetPath: dir, runPlan: plan }));

      expect(execSetupCommand).toHaveBeenCalledTimes(1);
      expect(stampInstallHash).toHaveBeenCalledWith(dir, computeInstallHash(dir));
      expect(computeInstallHash(dir)).not.toBe(stampedBefore);
    }
  );
});

describe('execSetupCommandDefault', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('streams lines and resolves success:true for a trivial passing command', async () => {
    const lines: string[] = [];
    const result = await execSetupCommandDefault(
      `node -e "console.log('setup-line')"`,
      process.cwd(),
      (line) => lines.push(line)
    );

    expect(result.success).toBe(true);
    expect(lines.some((l) => l.includes('setup-line'))).toBe(true);
  }, 15_000);

  it('resolves success:false for a failing command', async () => {
    const result = await execSetupCommandDefault(
      `node -e "process.exit(1)"`,
      process.cwd(),
      () => undefined
    );

    expect(result.success).toBe(false);
  }, 15_000);
});
