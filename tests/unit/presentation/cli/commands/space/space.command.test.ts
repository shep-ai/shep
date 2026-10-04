/**
 * `shep space` command group (spec 120)
 *
 * The commands are thin: they parse arguments (expanding ~ and defaulting the
 * path to the working directory), call one use case, and print its result.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SpaceResolutionSource, SpaceRuleKind } from '@/domain/generated/output.js';

const { spaces, membership, resolveContext, overview, agentConfig } = vi.hoisted(() => ({
  agentConfig: { show: vi.fn(), configure: vi.fn() },
  spaces: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setDefault: vi.fn(),
    createProductLine: vi.fn(),
    deleteProductLine: vi.fn(),
  },
  membership: {
    addRule: vi.fn(),
    listRules: vi.fn(),
    removeRule: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
  },
  resolveContext: { execute: vi.fn() },
  overview: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      switch (name) {
        case 'ManageSpacesUseCase':
          return spaces;
        case 'ManageSpaceMembershipUseCase':
          return membership;
        case 'ResolveSpaceContextUseCase':
          return resolveContext;
        case 'GetSpacesOverviewUseCase':
          return overview;
        case 'ConfigureSpaceAgentUseCase':
          return agentConfig;
        default:
          throw new Error(`unexpected token ${name}`);
      }
    }),
  },
}));

import { createSpaceCommand } from '../../../../../../src/presentation/cli/commands/space/index.js';

const T = new Date('2026-10-01T00:00:00Z');
const ACME = {
  id: 's-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  createdAt: T,
  updatedAt: T,
};

async function run(...args: string[]): Promise<string> {
  await createSpaceCommand().parseAsync(args, { from: 'user' });
  const log = vi.mocked(console.log).mock.calls.flat().join('\n');
  const error = vi.mocked(console.error).mock.calls.flat().join('\n');
  return `${log}\n${error}`;
}

describe('shep space', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe('new', () => {
    it('creates a space with the given options', async () => {
      spaces.create.mockResolvedValue({ ok: true, space: ACME });
      const out = await run('new', 'Acme', '--default', '-c', '#3456c4');
      expect(spaces.create).toHaveBeenCalledWith({
        name: 'Acme',
        description: undefined,
        color: '#3456c4',
        makeDefault: true,
      });
      expect(out).toContain('Acme');
      expect(process.exitCode).toBeUndefined();
    });

    it('prints a refusal and exits 1', async () => {
      spaces.create.mockResolvedValue({
        ok: false,
        error: 'A space with the slug "acme" already exists.',
      });
      const out = await run('new', 'Acme');
      expect(out).toContain('already exists');
      expect(process.exitCode).toBe(1);
    });

    it('reports an unexpected error and exits 1', async () => {
      spaces.create.mockRejectedValue(new Error('database is locked'));
      const out = await run('new', 'Acme');
      expect(out).toContain('database is locked');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('rule add', () => {
    beforeEach(() => {
      membership.addRule.mockImplementation(
        async (input: { kind: SpaceRuleKind; pattern: string }) => ({
          ok: true,
          rule: { id: 'r1', spaceId: ACME.id, priority: 100, createdAt: T, updatedAt: T, ...input },
        })
      );
    });

    it('expands ~ and leaves the kind for the use case to infer', async () => {
      await run('rule', 'add', 'acme', '~/work/acme');
      expect(membership.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          space: 'acme',
          kind: undefined,
          pattern: join(homedir(), 'work/acme'),
        })
      );
    });

    it('passes the product line and priority', async () => {
      await run('rule', 'add', 'acme', 'github.com/acme/*', '-l', 'payments', '-p', '10');
      expect(membership.addRule).toHaveBeenCalledWith({
        space: 'acme',
        kind: undefined,
        pattern: 'github.com/acme/*',
        productLine: 'payments',
        priority: 10,
      });
    });

    it('forces a Remote rule with --remote', async () => {
      await run('rule', 'add', 'acme', '/srv/mirror', '--remote');
      expect(membership.addRule).toHaveBeenCalledWith(
        expect.objectContaining({ kind: SpaceRuleKind.Remote })
      );
    });

    it('rejects a priority that is not a whole number', async () => {
      const out = await run('rule', 'add', 'acme', '/work', '-p', 'high');
      expect(membership.addRule).not.toHaveBeenCalled();
      expect(out).toContain('high');
      expect(process.exitCode).toBe(1);
    });
  });

  it('lists the rules of one space', async () => {
    membership.listRules.mockResolvedValue({
      ok: true,
      rules: [
        {
          id: 'r1',
          spaceId: ACME.id,
          kind: SpaceRuleKind.Remote,
          pattern: 'github.com/acme/*',
          priority: 100,
          createdAt: T,
          updatedAt: T,
        },
      ],
    });
    const out = await run('rule', 'ls', 'acme');
    expect(membership.listRules).toHaveBeenCalledWith('acme');
    expect(out).toContain('github.com/acme/*');
  });

  it('assigns the working directory when no path is given', async () => {
    membership.assign.mockImplementation(async (input: { repositoryPath: string }) => ({
      ok: true,
      assignment: {
        repositoryPath: input.repositoryPath,
        spaceId: ACME.id,
        createdAt: T,
        updatedAt: T,
      },
    }));
    await run('assign', 'acme', '--line', 'web');
    expect(membership.assign).toHaveBeenCalledWith({
      repositoryPath: resolve('.'),
      space: 'acme',
      productLine: 'web',
    });
  });

  it('unassigns a given path', async () => {
    membership.unassign.mockResolvedValue({ ok: true });
    await run('unassign', '/work/acme/api');
    expect(membership.unassign).toHaveBeenCalledWith(resolve('/work/acme/api'));
  });

  it('shows where a repository lands and why', async () => {
    resolveContext.execute.mockResolvedValue({
      repositoryPath: '/work/acme/api',
      space: ACME,
      productLine: {
        id: 'l1',
        spaceId: ACME.id,
        name: 'Payments',
        slug: 'payments',
        createdAt: T,
        updatedAt: T,
      },
      source: SpaceResolutionSource.Rule,
      rule: { id: 'r1', kind: SpaceRuleKind.Path, pattern: '/work/acme', priority: 100 },
    });
    const out = await run('show', '/work/acme/api');
    expect(resolveContext.execute).toHaveBeenCalledWith(resolve('/work/acme/api'));
    expect(out).toContain('Acme');
    expect(out).toContain('Payments');
    expect(out).toContain('Path rule /work/acme');
  });

  it('lists spaces with their lines and counts', async () => {
    overview.execute.mockResolvedValue({
      spaces: [
        {
          space: { ...ACME, isDefault: true },
          productLines: [
            {
              id: 'l1',
              spaceId: ACME.id,
              name: 'Payments',
              slug: 'payments',
              createdAt: T,
              updatedAt: T,
            },
          ],
          rules: [],
          memoryCount: 4,
          repositoryCount: 2,
        },
      ],
      repositories: [],
    });
    const out = await run('ls');
    expect(out).toContain('Acme');
    expect(out).toContain('(default)');
    expect(out).toContain('Payments');
  });

  it('removes a product line', async () => {
    spaces.deleteProductLine.mockResolvedValue({ ok: true });
    await run('line', 'rm', 'acme', 'payments');
    expect(spaces.deleteProductLine).toHaveBeenCalledWith('acme', 'payments');
  });

  it('makes a space the default', async () => {
    spaces.setDefault.mockResolvedValue({ ok: true, space: { ...ACME, isDefault: true } });
    const out = await run('default', 'acme');
    expect(spaces.setDefault).toHaveBeenCalledWith('acme');
    expect(out).toContain('Acme');
  });

  describe('config', () => {
    const configured = {
      ok: true,
      space: {
        ...ACME,
        agentSettings: {
          ghConfigDir: '/gh-acme',
          gitAuthorEmail: 'me@acme.com',
          useBedrock: false,
          allowedAgentTypes: ['claude-code'],
        },
      },
      environment: {
        set: { GH_CONFIG_DIR: '/gh-acme', GIT_AUTHOR_EMAIL: 'me@acme.com' },
        unset: ['GH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK'],
      },
    };

    it('shows the settings and the environment they produce when given no options', async () => {
      agentConfig.show.mockResolvedValue(configured);
      const out = await run('config', 'acme');
      expect(agentConfig.show).toHaveBeenCalledWith('acme');
      expect(agentConfig.configure).not.toHaveBeenCalled();
      expect(out).toContain('/gh-acme');
      expect(out).toContain('claude-code');
      expect(out).toContain('GH_TOKEN');
    });

    it('sets fields, expanding ~ in directories', async () => {
      agentConfig.configure.mockResolvedValue(configured);
      await run(
        'config',
        'acme',
        '--gh-config-dir',
        '~/.config/gh-acme',
        '--git-email',
        'me@acme.com',
        '--no-bedrock',
        '--agents',
        'claude-code, cursor'
      );
      expect(agentConfig.configure).toHaveBeenCalledWith('acme', {
        ghConfigDir: join(homedir(), '.config/gh-acme'),
        gitAuthorEmail: 'me@acme.com',
        useBedrock: false,
        allowedAgentTypes: ['claude-code', 'cursor'],
      });
    });

    it('sets which PR comments shep answers and thread resolution (spec 124)', async () => {
      agentConfig.configure.mockResolvedValue(configured);
      await run('config', 'acme', '--pr-comments', 'ALL', '--resolve-threads');
      expect(agentConfig.configure).toHaveBeenCalledWith('acme', {
        prCommentTrigger: 'All',
        prCommentResolveThreads: true,
      });
    });

    it('shows the default PR comment trigger', async () => {
      agentConfig.show.mockResolvedValue(configured);
      expect(await run('config', 'acme')).toContain('Mention (default)');
    });

    it('clears the named fields', async () => {
      agentConfig.configure.mockResolvedValue(configured);
      await run('config', 'acme', '--clear', 'gh-config-dir', 'bedrock', 'agents');
      expect(agentConfig.configure).toHaveBeenCalledWith('acme', {
        ghConfigDir: null,
        useBedrock: null,
        allowedAgentTypes: null,
      });
    });

    it('rejects an unknown field to clear', async () => {
      const out = await run('config', 'acme', '--clear', 'colour');
      expect(agentConfig.configure).not.toHaveBeenCalled();
      expect(out).toContain('colour');
      expect(process.exitCode).toBe(1);
    });

    it('prints a refusal and exits 1', async () => {
      agentConfig.configure.mockResolvedValue({ ok: false, error: '"x" is not an email address.' });
      const out = await run('config', 'acme', '--git-email', 'x');
      expect(out).toContain('not an email');
      expect(process.exitCode).toBe(1);
    });
  });
});
