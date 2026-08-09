/**
 * `shep dev` command group — structure and target selection.
 *
 * Two guards live here:
 *
 * 1. The group exposes exactly the surface FR-21 requires, and `dev` is
 *    registered in `index.ts` exactly once — the namespace was verified free
 *    against the existing top-level commands, and a second registration (or a
 *    rename onto `run`/`start`/`stop`/`status`/`_serve`) must fail loudly.
 * 2. Target selection resolves through `DeploymentTargetResolver`, including
 *    the bare-invocation case only the CLI has: "which target owns this cwd?".
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeploymentTargetType } from '@/domain/generated/output.js';

const { mockResolveToken, resolveRef, resolveFromCwd } = vi.hoisted(() => ({
  mockResolveToken: vi.fn(),
  resolveRef: vi.fn(),
  resolveFromCwd: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (token: string) => mockResolveToken(token) },
}));

const { createDevCommand } = await import(
  '../../../../../../src/presentation/cli/commands/dev/index.js'
);
const { resolveDevTarget } = await import(
  '../../../../../../src/presentation/cli/commands/dev/target.js'
);

const CLI_INDEX = resolvePath(
  import.meta.dirname,
  '../../../../../../src/presentation/cli/index.ts'
);

const REPO_PATH = '/workspaces/acme';

describe('shep dev command group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveToken.mockImplementation((token: string) => {
      if (token === 'DeploymentTargetResolver') {
        return { resolve: resolveRef, resolveFromCwd };
      }
      return {};
    });
  });

  it('is named "dev" and carries a translated description', () => {
    const dev = createDevCommand();
    expect(dev.name()).toBe('dev');
    expect(dev.description()).toBe('Run and inspect a local dev server');
  });

  it('exposes start, stop, status, logs and plan', () => {
    const names = createDevCommand()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual(['logs', 'plan', 'start', 'status', 'stop']);
  });

  it('lists every subcommand in its help output', () => {
    const help = createDevCommand().helpInformation();
    for (const name of ['start', 'stop', 'status', 'logs', 'plan']) {
      expect(help).toContain(name);
    }
  });

  it('exposes plan show, set and clear', () => {
    const plan = createDevCommand().commands.find((command) => command.name() === 'plan');
    const names = plan?.commands.map((command) => command.name()).sort();
    expect(names).toEqual(['clear', 'set', 'show']);
  });

  it('gives every subcommand the shared target flags', () => {
    for (const command of createDevCommand().commands) {
      const subjects = command.name() === 'plan' ? command.commands : [command];
      for (const subject of subjects) {
        const flags = subject.options.map((option) => option.long);
        expect(flags).toContain('--app');
        expect(flags).toContain('--feature');
        expect(flags).toContain('--repo');
      }
    }
  });

  describe('registration in index.ts', () => {
    const source = readFileSync(CLI_INDEX, 'utf-8');

    it('registers the dev command exactly once', () => {
      const registrations = source.match(/program\.addCommand\(createDevCommand\(\)\)/g) ?? [];
      expect(registrations).toHaveLength(1);
    });

    it('imports the factory from the dev command group', () => {
      expect(source).toContain("import { createDevCommand } from './commands/dev/index.js';");
    });

    it('does not rename any existing top-level command onto the dev namespace', () => {
      for (const existing of ['createRunCommand', 'createStartCommand', 'createStopCommand']) {
        expect(source).toContain(`program.addCommand(${existing}())`);
      }
    });
  });

  describe('target selection', () => {
    it('resolves an explicit application id through the resolver', async () => {
      resolveRef.mockResolvedValue({
        status: 'resolved',
        target: {
          targetType: DeploymentTargetType.Application,
          targetId: 'app-1',
          repoPath: REPO_PATH,
        },
      });

      const result = await resolveDevTarget({ app: 'app-1' });

      expect(resolveRef).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
      });
      expect('target' in result && result.target.repoPath).toBe(REPO_PATH);
    });

    it('resolves a bare invocation from the working directory', async () => {
      resolveFromCwd.mockResolvedValue({
        status: 'resolved',
        target: {
          targetType: DeploymentTargetType.Repository,
          targetId: REPO_PATH,
          repoPath: REPO_PATH,
        },
      });

      const result = await resolveDevTarget({});

      expect(resolveFromCwd).toHaveBeenCalledWith(process.cwd());
      expect('target' in result && result.target.targetType).toBe(DeploymentTargetType.Repository);
    });

    it('refuses more than one explicit target', async () => {
      const result = await resolveDevTarget({ app: 'app-1', feature: 'feat-1' });

      expect('error' in result && result.error).toContain('--app');
      expect(resolveRef).not.toHaveBeenCalled();
      expect(resolveFromCwd).not.toHaveBeenCalled();
    });

    it('adds a flag hint when no target owns the working directory', async () => {
      resolveFromCwd.mockResolvedValue({
        status: 'unmatched',
        cwd: '/tmp/elsewhere',
        message: 'No application, feature or repository is registered for /tmp/elsewhere',
      });

      const result = await resolveDevTarget({});

      expect('error' in result && result.error).toContain('/tmp/elsewhere');
      expect('error' in result && result.error).toContain('--repo');
    });

    it('surfaces the resolver message for a missing target', async () => {
      resolveRef.mockResolvedValue({
        status: 'not-found',
        targetType: DeploymentTargetType.Feature,
        targetId: 'nope',
        message: 'No feature found for "nope"',
      });

      const result = await resolveDevTarget({ feature: 'nope' });

      expect('error' in result && result.error).toBe('No feature found for "nope"');
    });

    it('reports ambiguity with its candidates instead of guessing', async () => {
      const candidates = [
        { targetType: DeploymentTargetType.Application, targetId: 'a', repoPath: REPO_PATH },
        { targetType: DeploymentTargetType.Application, targetId: 'b', repoPath: REPO_PATH },
      ];
      resolveFromCwd.mockResolvedValue({
        status: 'ambiguous',
        candidates,
        message: 'Several application targets are registered',
      });

      const result = await resolveDevTarget({});

      expect('candidates' in result && result.candidates).toHaveLength(2);
    });
  });
});
