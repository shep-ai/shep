/**
 * `shep connection` and `shep sync` (spec 122): thin commands over the
 * tracker use cases. The secret is prompted (or read from an env var) and
 * never accepted as an argument.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TrackerConnectionStatus,
  TrackerProvider,
  TrackerSyncDirection,
} from '@/domain/generated/output.js';

const { connections, rules, runner, password } = vi.hoisted(() => ({
  connections: { list: vi.fn(), create: vi.fn(), test: vi.fn(), remove: vi.fn() },
  rules: { list: vi.fn(), create: vi.fn(), setEnabled: vi.fn(), remove: vi.fn() },
  runner: { runAll: vi.fn() },
  password: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({ password: (...a: unknown[]) => password(...a) }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      if (name === 'ManageTrackerConnectionsUseCase') return connections;
      if (name === 'ManageTrackerSyncRulesUseCase') return rules;
      if (name === 'SyncTrackerRulesUseCase') return runner;
      if (name === 'RunTrackerSyncUseCase') return { execute: runner.runAll };
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createConnectionCommand } from '../../../../../../src/presentation/cli/commands/connection/index.js';
import { createSyncCommand } from '../../../../../../src/presentation/cli/commands/sync/index.js';

const T = new Date('2026-10-01T10:00:00Z');
const CONNECTION = {
  id: 'c1',
  provider: TrackerProvider.Jira,
  name: 'Acme Jira',
  slug: 'acme-jira',
  spaceId: 's',
  siteUrl: 'https://acme.atlassian.net',
  accountEmail: 'me@acme.com',
  accountName: 'Ada',
  status: TrackerConnectionStatus.Connected,
  createdAt: T,
  updatedAt: T,
};
const RULE = {
  id: 'rule-1',
  connectionId: 'c1',
  projectId: 'p1',
  scope: 'project = PAY',
  direction: TrackerSyncDirection.TwoWay,
  intervalMinutes: 15,
  enabled: true,
  lastRunAt: T,
  lastRun: { created: 2, updated: 1, pushed: 1, conflicts: 0, failed: 0, rateLimited: false },
  createdAt: T,
  updatedAt: T,
};

async function run(command: 'connection' | 'sync', ...args: string[]): Promise<string> {
  const group = command === 'connection' ? createConnectionCommand() : createSyncCommand();
  await group.parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep connection / shep sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    delete process.env.TEST_JIRA_TOKEN;
  });

  it('adds a Jira connection with a prompted token', async () => {
    password.mockResolvedValue('secret-token');
    connections.create.mockResolvedValue({ ok: true, connection: CONNECTION });

    const out = await run(
      'connection',
      'add',
      'jira',
      '--name',
      'Acme Jira',
      '--site',
      'https://acme.atlassian.net',
      '--email',
      'me@acme.com',
      '--space',
      'acme'
    );

    expect(connections.create).toHaveBeenCalledWith({
      provider: TrackerProvider.Jira,
      name: 'Acme Jira',
      space: 'acme',
      siteUrl: 'https://acme.atlassian.net',
      accountEmail: 'me@acme.com',
      secret: 'secret-token',
    });
    expect(out).toContain('Acme Jira');
    expect(out).not.toContain('secret-token');
  });

  it('reads the secret from an environment variable without prompting', async () => {
    process.env.TEST_JIRA_TOKEN = 'from-env';
    connections.create.mockResolvedValue({
      ok: true,
      connection: { ...CONNECTION, provider: TrackerProvider.Linear },
    });
    await run('connection', 'add', 'linear', '--name', 'L', '--secret-env', 'TEST_JIRA_TOKEN');
    expect(password).not.toHaveBeenCalled();
    expect(connections.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: TrackerProvider.Linear, secret: 'from-env' })
    );
  });

  it('refuses an unknown provider and an empty env var', async () => {
    let out = await run('connection', 'add', 'trello', '--name', 'T');
    expect(out).toContain('trello');
    expect(connections.create).not.toHaveBeenCalled();
    out = await run(
      'connection',
      'add',
      'linear',
      '--name',
      'L',
      '--secret-env',
      'NOT_SET_ANYWHERE'
    );
    expect(out).toContain('NOT_SET_ANYWHERE');
    expect(process.exitCode).toBe(1);
  });

  it('lists, tests and removes connections', async () => {
    connections.list.mockResolvedValue([CONNECTION]);
    expect(await run('connection', 'ls')).toContain('acme-jira');

    connections.test.mockResolvedValue({ ok: false, error: 'Jira: Unauthorized' });
    expect(await run('connection', 'test', 'acme-jira')).toContain('Unauthorized');
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    connections.remove.mockResolvedValue({ ok: true });
    await run('connection', 'rm', 'acme-jira');
    expect(connections.remove).toHaveBeenCalledWith('acme-jira');
  });

  it('adds a two-way rule with an interval', async () => {
    rules.create.mockResolvedValue({ ok: true, rule: RULE });
    await run(
      'sync',
      'rule',
      'add',
      'acme-jira',
      '--project',
      'pay',
      '--scope',
      'project = PAY',
      '--two-way',
      '--every',
      '30'
    );
    expect(rules.create).toHaveBeenCalledWith({
      connection: 'acme-jira',
      project: 'pay',
      scope: 'project = PAY',
      direction: TrackerSyncDirection.TwoWay,
      intervalMinutes: 30,
    });
  });

  it('rejects an interval that is not a whole number', async () => {
    const out = await run(
      'sync',
      'rule',
      'add',
      'c',
      '--project',
      'p',
      '--scope',
      'ENG',
      '--every',
      'soon'
    );
    expect(rules.create).not.toHaveBeenCalled();
    expect(out).toContain('soon');
  });

  it('lists rules with their last run', async () => {
    rules.list.mockResolvedValue({
      ok: true,
      rules: [
        {
          rule: RULE,
          connection: { name: 'Acme Jira', slug: 'acme-jira', provider: TrackerProvider.Jira },
          project: { name: 'Payments', slug: 'pay' },
        },
      ],
    });
    const out = await run('sync', 'rule', 'ls');
    expect(out).toContain('project = PAY');
    expect(out).toContain('pay');
  });

  it('enables, disables and removes a rule', async () => {
    rules.setEnabled.mockResolvedValue({ ok: true, rule: RULE });
    rules.remove.mockResolvedValue({ ok: true });
    await run('sync', 'rule', 'disable', 'rule-1');
    await run('sync', 'rule', 'enable', 'rule-1');
    await run('sync', 'rule', 'rm', 'rule-1');
    expect(rules.setEnabled.mock.calls).toEqual([
      ['rule-1', false],
      ['rule-1', true],
    ]);
    expect(rules.remove).toHaveBeenCalledWith('rule-1');
  });

  it('runs every rule and prints what each did, exiting 1 when one failed', async () => {
    runner.runAll.mockResolvedValue([
      { ok: true, rule: RULE, summary: RULE.lastRun },
      {
        ok: true,
        rule: { ...RULE, id: 'rule-2' },
        summary: { ...RULE.lastRun, rateLimited: true },
        error: 'Jira: rate limited',
      },
    ]);
    const out = await run('sync', 'run');
    expect(out).toContain('2 created');
    expect(out).toContain('rate limited');
    expect(process.exitCode).toBe(1);
  });

  it('runs one rule', async () => {
    runner.runAll.mockResolvedValue({ ok: true, rule: RULE, summary: RULE.lastRun });
    const out = await run('sync', 'run', 'rule-1');
    expect(runner.runAll).toHaveBeenCalledWith('rule-1');
    expect(out).toContain('1 pushed');
  });
});
