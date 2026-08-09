/**
 * `shep dev start | stop | status | logs` — behaviour tests.
 *
 * The contracts under test are the ones a user notices: a start that streams
 * the lifecycle until Ready, an interrupt that detaches instead of killing, a
 * failed run that exits non-zero with the reason the graph reported, and
 * stop/status/logs behaving sanely when nothing is running.
 *
 * Everything is driven through mocked use-case tokens — which doubles as the
 * FR-23 check: if a command reached for a repository or an infrastructure
 * service instead, these stubs would never be consulted.
 */

import 'reflect-metadata';
import { Command } from 'commander';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { DeploymentState, DeploymentTargetType } from '@/domain/generated/output.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-vocabulary.js';
import { RunPlanSource } from '@/domain/generated/output.js';

const stubs = vi.hoisted(() => ({
  resolveToken: vi.fn(),
  resolveFromCwd: vi.fn(),
  startApplication: vi.fn(),
  startFeature: vi.fn(),
  startRepository: vi.fn(),
  stopDeployment: vi.fn(),
  getStatus: vi.fn(),
  getRunPlan: vi.fn(),
  streamLogs: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (token: string) => stubs.resolveToken(token) },
}));

const { createDevStartCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/start.command.js'
);
const { createDevStopCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/stop.command.js'
);
const { createDevStatusCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/status.command.js'
);
const { createDevLogsCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/logs.command.js'
);

const REPO_PATH = '/workspaces/acme';
const APP_TARGET = {
  targetType: DeploymentTargetType.Application,
  targetId: 'app-1',
  repoPath: REPO_PATH,
};

/** Everything the commands print, in one string. */
let output: string[];

function written(): string {
  return output.join('\n');
}

function makeLogStream(lines: string[]) {
  return {
    tracked: true,
    history: lines.map((line) => ({
      targetId: APP_TARGET.targetId,
      stream: 'stdout' as const,
      line,
      timestamp: 1,
    })),
    close: vi.fn(),
  };
}

describe('shep dev lifecycle commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    output = [];
    process.exitCode = undefined;

    // The write callback MUST be honoured: `flushOutput()` awaits it before
    // the streaming commands exit, so swallowing it would hang the command.
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      output.push(String(chunk));
      const callback = rest.find((arg) => typeof arg === 'function');
      if (typeof callback === 'function') callback();
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    stubs.resolveFromCwd.mockResolvedValue({ status: 'resolved', target: APP_TARGET });
    stubs.streamLogs.mockReturnValue(makeLogStream([]));
    stubs.getRunPlan.mockResolvedValue({
      status: DevServerRunPlanStatus.NoPlan,
      repoPath: REPO_PATH,
      repoConfigControlled: false,
    });

    stubs.resolveToken.mockImplementation((token: string) => {
      switch (token) {
        case 'DeploymentTargetResolver':
          return { resolve: vi.fn(), resolveFromCwd: stubs.resolveFromCwd };
        case 'StartApplicationDeploymentUseCase':
          return { execute: stubs.startApplication };
        case 'StartFeatureDeploymentUseCase':
          return { execute: stubs.startFeature };
        case 'StartRepositoryDeploymentUseCase':
          return { execute: stubs.startRepository };
        case 'StopDeploymentUseCase':
          return { execute: stubs.stopDeployment };
        case 'GetDeploymentStatusUseCase':
          return { execute: stubs.getStatus };
        case 'GetDevServerRunPlanUseCase':
          return { execute: stubs.getRunPlan };
        case 'StreamDeploymentLogsUseCase':
          return { execute: stubs.streamLogs };
        default:
          throw new Error(`unexpected token: ${token}`);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dev start', () => {
    it('accepts the run through the application start use case', async () => {
      stubs.startApplication.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.getStatus.mockResolvedValue({
        state: DeploymentState.Ready,
        url: 'http://localhost:3000',
      });

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(stubs.startApplication).toHaveBeenCalledWith({ applicationId: 'app-1' });
      expect(written()).toContain('http://localhost:3000');
      expect(process.exitCode).toBeUndefined();
    });

    it('starts a repository target from its path, not its id', async () => {
      stubs.resolveFromCwd.mockResolvedValue({
        status: 'resolved',
        target: {
          targetType: DeploymentTargetType.Repository,
          targetId: REPO_PATH,
          repoPath: REPO_PATH,
        },
      });
      stubs.startRepository.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.getStatus.mockResolvedValue({ state: DeploymentState.Ready, url: null });

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(stubs.startRepository).toHaveBeenCalledWith(REPO_PATH);
    });

    it('streams state transitions and captured output', async () => {
      stubs.startApplication.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.streamLogs.mockReturnValue(makeLogStream(['> next dev']));
      stubs.getStatus
        .mockResolvedValueOnce({ state: DeploymentState.Installing, url: null })
        .mockResolvedValue({ state: DeploymentState.Ready, url: 'http://localhost:3000' });

      await createDevStartCommand().parseAsync([], { from: 'user' });

      const text = written();
      expect(text).toContain('> next dev');
      expect(text).toContain('installing');
      expect(text).toContain('ready');
    });

    it('exits non-zero with the reason when the run never becomes ready', async () => {
      stubs.startApplication.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.streamLogs.mockReturnValue(makeLogStream(['Dependency install failed (exit 1)']));
      stubs.getStatus.mockResolvedValue(null);

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
      expect(written()).toContain('Dependency install failed (exit 1)');
    });

    it('detaches on SIGINT without stopping the dev server', async () => {
      stubs.startApplication.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.getStatus.mockImplementation(async () => {
        process.emit('SIGINT');
        return { state: DeploymentState.Booting, url: null };
      });

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(stubs.stopDeployment).not.toHaveBeenCalled();
      expect(written()).toContain('shep dev stop');
      expect(process.exitCode).toBeUndefined();
    });

    it('reports a rejected start and exits non-zero', async () => {
      stubs.startApplication.mockRejectedValue(new Error('Cannot start a dev server for itself'));

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
      expect(stubs.getStatus).not.toHaveBeenCalled();
    });

    it('reports an unresolvable target without starting anything', async () => {
      stubs.resolveFromCwd.mockResolvedValue({
        status: 'unmatched',
        cwd: '/tmp/elsewhere',
        message: 'No application, feature or repository is registered for /tmp/elsewhere',
      });

      await createDevStartCommand().parseAsync([], { from: 'user' });

      expect(stubs.startApplication).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('does not fire the root default action when invoked as a subcommand', async () => {
      const rootAction = vi.fn();
      const program = new Command().name('shep').action(rootAction);
      program.addCommand(createDevStartCommand().name('dev'));
      stubs.startApplication.mockResolvedValue({ state: DeploymentState.Analyzing });
      stubs.getStatus.mockResolvedValue({ state: DeploymentState.Ready, url: null });

      await program.parseAsync(['dev'], { from: 'user' });

      expect(rootAction).not.toHaveBeenCalled();
      expect(stubs.startApplication).toHaveBeenCalled();
    });
  });

  describe('dev stop', () => {
    it('stops a running deployment by its target id', async () => {
      stubs.getStatus.mockResolvedValue({ state: DeploymentState.Ready, url: null });

      await createDevStopCommand().parseAsync([], { from: 'user' });

      expect(stubs.stopDeployment).toHaveBeenCalledWith('app-1');
      expect(written()).toContain(REPO_PATH);
    });

    it('reports "not running" instead of calling stop', async () => {
      stubs.getStatus.mockResolvedValue(null);

      await createDevStopCommand().parseAsync([], { from: 'user' });

      expect(stubs.stopDeployment).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('dev status', () => {
    it('prints state, url, command and expected port', async () => {
      stubs.getStatus.mockResolvedValue({
        state: DeploymentState.Ready,
        url: 'http://localhost:5173',
      });
      stubs.getRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
        plan: {
          repoPath: REPO_PATH,
          command: 'pnpm dev',
          cwd: REPO_PATH,
          source: RunPlanSource.Deterministic,
          setupCommands: [],
          expectedPort: 5173,
          isStale: false,
        },
      });

      await createDevStatusCommand().parseAsync([], { from: 'user' });

      const text = written();
      expect(text).toContain(DeploymentState.Ready);
      expect(text).toContain('http://localhost:5173');
      expect(text).toContain('pnpm dev');
      expect(text).toContain('5173');
    });

    it('reports "not running" with no plan cached', async () => {
      stubs.getStatus.mockResolvedValue(null);

      await createDevStatusCommand().parseAsync([], { from: 'user' });

      expect(written()).toContain('not running');
      expect(process.exitCode).toBeUndefined();
    });

    it('emits machine-readable output with --json', async () => {
      stubs.getStatus.mockResolvedValue({ state: DeploymentState.Booting, url: null });

      await createDevStatusCommand().parseAsync(['--json'], { from: 'user' });

      const parsed = JSON.parse(written());
      expect(parsed.status.state).toBe(DeploymentState.Booting);
      expect(parsed.target.repoPath).toBe(REPO_PATH);
    });
  });

  describe('dev logs', () => {
    it('prints the captured trail without following', async () => {
      stubs.streamLogs.mockReturnValue(makeLogStream(['line one', 'line two']));

      await createDevLogsCommand().parseAsync([], { from: 'user' });

      expect(written()).toContain('line one');
      expect(stubs.getStatus).not.toHaveBeenCalled();
    });

    it('limits output with --lines', async () => {
      stubs.streamLogs.mockReturnValue(makeLogStream(['first', 'second', 'third']));

      await createDevLogsCommand().parseAsync(['--lines', '1'], { from: 'user' });

      const text = written();
      expect(text).toContain('third');
      expect(text).not.toContain('first');
    });

    it('reports an untracked target', async () => {
      stubs.streamLogs.mockReturnValue({ tracked: false, history: [], close: vi.fn() });

      await createDevLogsCommand().parseAsync([], { from: 'user' });

      expect(written()).toContain(REPO_PATH);
    });

    it('follows until the deployment ends, exiting zero', async () => {
      stubs.streamLogs.mockReturnValue(makeLogStream(['booting']));
      stubs.getStatus.mockResolvedValue(null);

      await createDevLogsCommand().parseAsync(['--follow'], { from: 'user' });

      expect(stubs.getStatus).toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('keeps following after the server is ready', async () => {
      stubs.streamLogs.mockReturnValue(makeLogStream([]));
      stubs.getStatus
        .mockResolvedValueOnce({ state: DeploymentState.Ready, url: 'http://localhost:3000' })
        .mockResolvedValue(null);

      await createDevLogsCommand().parseAsync(['--follow'], { from: 'user' });

      expect(stubs.getStatus.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
