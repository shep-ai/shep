/**
 * `shep dev plan show | set | clear` — behaviour tests.
 *
 * The point of these is that the CLI decides nothing. `isStale` is printed
 * from the flag the use case derived, validation errors are rendered from the
 * typed result rather than pre-checked here, and the `.shep/dev.json` conflict
 * is reported as the refusal it is instead of a silently ignored write.
 */

import 'reflect-metadata';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  DevServerRunPlanStatus,
  RunPlanOverrideField,
} from '@/application/use-cases/deployments/dev-server-run-plan-vocabulary.js';
import { DeploymentTargetType, RunPlanSource } from '@/domain/generated/output.js';

const stubs = vi.hoisted(() => ({
  resolveToken: vi.fn(),
  resolveFromCwd: vi.fn(),
  getRunPlan: vi.fn(),
  overrideRunPlan: vi.fn(),
  invalidateRunPlan: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (token: string) => stubs.resolveToken(token) },
}));

const { createDevPlanCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/plan.command.js'
);

const REPO_PATH = '/workspaces/acme';
const TARGET = {
  targetType: DeploymentTargetType.Application,
  targetId: 'app-1',
  repoPath: REPO_PATH,
};

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    repoPath: REPO_PATH,
    command: 'pnpm dev',
    cwd: REPO_PATH,
    source: RunPlanSource.Deterministic,
    setupCommands: [],
    isStale: false,
    ...overrides,
  };
}

let output: string[];

function written(): string {
  return output.join('\n');
}

async function run(args: string[]): Promise<void> {
  await createDevPlanCommand().parseAsync(args, { from: 'user' });
}

describe('shep dev plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    output = [];
    process.exitCode = undefined;

    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });

    stubs.resolveFromCwd.mockResolvedValue({ status: 'resolved', target: TARGET });
    stubs.resolveToken.mockImplementation((token: string) => {
      switch (token) {
        case 'DeploymentTargetResolver':
          return { resolve: vi.fn(), resolveFromCwd: stubs.resolveFromCwd };
        case 'GetDevServerRunPlanUseCase':
          return { execute: stubs.getRunPlan };
        case 'OverrideDevServerRunPlanUseCase':
          return { execute: stubs.overrideRunPlan };
        case 'InvalidateDevServerRunPlanUseCase':
          return { execute: stubs.invalidateRunPlan };
        default:
          throw new Error(`unexpected token: ${token}`);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('plan show', () => {
    it('prints every field of a resolved plan', async () => {
      stubs.getRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
        plan: makePlan({
          command: 'make dev',
          expectedPort: 8080,
          language: 'Go',
          framework: 'Echo',
          packageManager: 'go',
          setupCommands: ['go mod download'],
          source: RunPlanSource.Agent,
        }),
      });

      await run(['show']);

      const text = written();
      expect(text).toContain('make dev');
      expect(text).toContain(REPO_PATH);
      expect(text).toContain('Go');
      expect(text).toContain('Echo');
      expect(text).toContain('8080');
      expect(text).toContain('go mod download');
      expect(text).toContain('AI-analyzed');
    });

    it('prints the staleness hint from the flag the use case derived', async () => {
      stubs.getRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
        plan: makePlan({ isStale: true, source: RunPlanSource.Manual }),
      });

      await run(['show']);

      expect(written()).toContain('config files have changed');
      expect(written()).toContain('pinned');
    });

    it('reports "no plan" cleanly rather than as an error', async () => {
      stubs.getRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.NoPlan,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
      });

      await run(['show']);

      expect(written()).toContain(REPO_PATH);
      expect(process.exitCode).toBeUndefined();
    });

    it('explains that a committed .shep/dev.json is in charge', async () => {
      stubs.getRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        repoConfigControlled: true,
        plan: makePlan({ source: RunPlanSource.Manual }),
      });

      await run(['show']);

      expect(written()).toContain('.shep/dev.json');
    });

    it('emits the use-case result verbatim with --json', async () => {
      const result = {
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
        plan: makePlan(),
      };
      stubs.getRunPlan.mockResolvedValue(result);

      await run(['show', '--json']);

      expect(JSON.parse(written())).toEqual(result);
    });

    it('exits non-zero when the target cannot be resolved', async () => {
      stubs.resolveFromCwd.mockResolvedValue({
        status: 'unmatched',
        cwd: '/tmp/elsewhere',
        message: 'No application, feature or repository is registered for /tmp/elsewhere',
      });

      await run(['show']);

      expect(stubs.getRunPlan).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('plan set', () => {
    it('sends only the fields that were supplied', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        plan: makePlan({ command: 'make dev', source: RunPlanSource.Manual }),
      });

      await run(['set', '--command', 'make dev']);

      expect(stubs.overrideRunPlan).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
        command: 'make dev',
      });
      expect(written()).toContain('make dev');
      expect(written()).toContain('executed on your machine');
    });

    it('passes every supplied field through, including setup commands', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        plan: makePlan({ source: RunPlanSource.Manual }),
      });

      await run([
        'set',
        '--command',
        'uv run app',
        '--cwd',
        'services/api',
        '--port',
        '8000',
        '--language',
        'Python',
        '--framework',
        'Django',
        '--package-manager',
        'uv',
        '--setup',
        'uv sync',
        'uv lock',
      ]);

      expect(stubs.overrideRunPlan).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
        command: 'uv run app',
        cwd: 'services/api',
        expectedPort: 8000,
        language: 'Python',
        framework: 'Django',
        packageManager: 'uv',
        setupCommands: ['uv sync', 'uv lock'],
      });
    });

    it('clears an optional field with `none`', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        plan: makePlan({ source: RunPlanSource.Manual }),
      });

      await run(['set', '--port', 'none', '--clear-setup']);

      expect(stubs.overrideRunPlan).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
        expectedPort: null,
        setupCommands: [],
      });
    });

    it('renders per-field validation errors and exits non-zero', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.ValidationFailed,
        errors: [
          {
            field: RunPlanOverrideField.Command,
            message: 'A dev server command is required.',
          },
          {
            field: RunPlanOverrideField.Cwd,
            message: `The working directory must be inside ${REPO_PATH}.`,
          },
        ],
      });

      await run(['set', '--cwd', '/etc']);

      expect(process.exitCode).toBe(1);
      const text = written();
      expect(text).toContain('A dev server command is required.');
      expect(text).toContain('must be inside');
    });

    it('reports the .shep/dev.json conflict and exits non-zero', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.RepoConfigControlled,
        repoPath: REPO_PATH,
        message: 'A committed .shep/dev.json controls this repository — edit that file.',
      });

      await run(['set', '--command', 'make dev']);

      expect(process.exitCode).toBe(1);
      expect(written()).toContain('.shep/dev.json');
    });

    it('does not validate anything itself — a blank command still reaches the use case', async () => {
      stubs.overrideRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.ValidationFailed,
        errors: [
          { field: RunPlanOverrideField.Command, message: 'A dev server command is required.' },
        ],
      });

      await run(['set', '--command', '   ']);

      expect(stubs.overrideRunPlan).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
        command: '   ',
      });
    });
  });

  describe('plan clear', () => {
    it('clears a plan of any source and names what it discarded', async () => {
      stubs.invalidateRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        clearedSource: RunPlanSource.Manual,
        repoConfigControlled: false,
      });

      await run(['clear']);

      expect(stubs.invalidateRunPlan).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
      });
      expect(written()).toContain('pinned');
      expect(process.exitCode).toBeUndefined();
    });

    it('reports when nothing was cached', async () => {
      stubs.invalidateRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.NoPlan,
        repoPath: REPO_PATH,
        repoConfigControlled: false,
      });

      await run(['clear']);

      expect(written()).toContain(REPO_PATH);
      expect(process.exitCode).toBeUndefined();
    });

    it('warns that a committed file still controls the repository', async () => {
      stubs.invalidateRunPlan.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        clearedSource: RunPlanSource.Deterministic,
        repoConfigControlled: true,
        message: 'A committed .shep/dev.json controls this repository — edit that file.',
      });

      await run(['clear']);

      expect(written()).toContain('.shep/dev.json');
    });
  });
});
