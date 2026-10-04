/**
 * `shep knowledge` and `shep connection add notion` (spec 125): thin commands
 * over the knowledge use cases.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConnectionProvider,
  ConnectionStatus,
  KnowledgeScopeKind,
} from '@/domain/generated/output.js';

const { sources, syncOne, syncAll, list, select, connections, password } = vi.hoisted(() => ({
  sources: { list: vi.fn(), create: vi.fn(), setEnabled: vi.fn(), remove: vi.fn() },
  syncOne: { execute: vi.fn() },
  syncAll: { runAll: vi.fn() },
  list: { execute: vi.fn() },
  select: { execute: vi.fn() },
  connections: { create: vi.fn() },
  password: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({ password: (...a: unknown[]) => password(...a) }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        ManageKnowledgeSourcesUseCase: sources,
        SyncKnowledgeSourceUseCase: syncOne,
        SyncKnowledgeSourcesUseCase: syncAll,
        ListKnowledgeUseCase: list,
        SelectKnowledgeUseCase: select,
        ManageConnectionsUseCase: connections,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createKnowledgeCommand } from '../../../../../../src/presentation/cli/commands/knowledge/index.js';
import { createConnectionCommand } from '../../../../../../src/presentation/cli/commands/connection/index.js';

const T = new Date('2026-10-01T10:00:00Z');
const CONNECTION = {
  id: 'c1',
  provider: ConnectionProvider.Notion,
  name: 'Acme Notion',
  slug: 'acme-notion',
  spaceId: 's1',
  accountName: 'Acme',
  status: ConnectionStatus.Connected,
  createdAt: T,
  updatedAt: T,
};
const SOURCE = {
  id: 'src-1',
  connectionId: 'c1',
  spaceId: 's1',
  scopeId: 'page-1',
  scopeKind: KnowledgeScopeKind.Page,
  scopeTitle: 'Engineering handbook',
  intervalMinutes: 60,
  enabled: true,
  lastRunAt: T,
  lastRun: { added: 3, updated: 1, removed: 0, failed: 0 },
  createdAt: T,
  updatedAt: T,
};

async function run(group: 'knowledge' | 'connection', ...args: string[]): Promise<string> {
  const command = group === 'knowledge' ? createKnowledgeCommand() : createConnectionCommand();
  await command.parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep knowledge', () => {
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

  it('connects Notion with a prompted integration token', async () => {
    password.mockResolvedValue('ntn_secret');
    connections.create.mockResolvedValue({ ok: true, connection: CONNECTION });

    const out = await run(
      'connection',
      'add',
      'notion',
      '--name',
      'Acme Notion',
      '--space',
      'acme'
    );

    expect(password).toHaveBeenCalledWith(expect.objectContaining({ mask: '*' }));
    expect(connections.create).toHaveBeenCalledWith({
      provider: ConnectionProvider.Notion,
      name: 'Acme Notion',
      space: 'acme',
      secret: 'ntn_secret',
    });
    expect(out).toContain('Acme Notion');
    expect(out).not.toContain('ntn_secret');
  });

  it('adds a source for a product line with an interval', async () => {
    sources.create.mockResolvedValue({ ok: true, source: SOURCE });
    const out = await run(
      'knowledge',
      'source',
      'add',
      'acme-notion',
      '--scope',
      'https://www.notion.so/Handbook-0123456789abcdef0123456789abcdef',
      '--product-line',
      'platform',
      '--every',
      '120'
    );
    expect(sources.create).toHaveBeenCalledWith({
      connection: 'acme-notion',
      scope: 'https://www.notion.so/Handbook-0123456789abcdef0123456789abcdef',
      productLine: 'platform',
      intervalMinutes: 120,
    });
    expect(out).toContain('Engineering handbook');
  });

  it('rejects an interval that is not a whole number', async () => {
    const out = await run('knowledge', 'source', 'add', 'n', '--scope', 'x', '--every', 'hourly');
    expect(sources.create).not.toHaveBeenCalled();
    expect(out).toContain('hourly');
    expect(process.exitCode).toBe(1);
  });

  it('prints a refusal and exits 1', async () => {
    sources.create.mockResolvedValue({ ok: false, error: 'Acme Jira is not a knowledge tool.' });
    const out = await run('knowledge', 'source', 'add', 'acme-jira', '--scope', 'x');
    expect(out).toContain('not a knowledge tool');
    expect(process.exitCode).toBe(1);
  });

  it('lists sources with their documents and last run', async () => {
    sources.list.mockResolvedValue([{ source: SOURCE, connection: CONNECTION, documents: 4 }]);
    const out = await run('knowledge', 'source', 'ls');
    expect(out).toContain('Engineering handbook');
    expect(out).toContain('acme-notion');
    expect(out).toContain('3 added');
  });

  it('enables, disables and removes a source', async () => {
    sources.setEnabled.mockResolvedValue({ ok: true });
    sources.remove.mockResolvedValue({ ok: true });
    await run('knowledge', 'source', 'disable', 'src-1');
    await run('knowledge', 'source', 'enable', 'src-1');
    await run('knowledge', 'source', 'rm', 'src-1');
    expect(sources.setEnabled.mock.calls).toEqual([
      ['src-1', false],
      ['src-1', true],
    ]);
    expect(sources.remove).toHaveBeenCalledWith('src-1');
  });

  it('syncs every source, exiting 1 when one stopped early', async () => {
    syncAll.runAll.mockResolvedValue([
      { ok: true, source: SOURCE, summary: SOURCE.lastRun },
      {
        ok: true,
        source: { ...SOURCE, scopeTitle: 'Runbooks' },
        summary: { added: 0, updated: 0, removed: 0, failed: 0 },
        error: 'Notion: rate limited',
      },
    ]);
    const out = await run('knowledge', 'sync');
    expect(out).toContain('Engineering handbook: 3 added');
    expect(out).toContain('rate limited');
    expect(process.exitCode).toBe(1);
  });

  it('syncs one source', async () => {
    syncOne.execute.mockResolvedValue({ ok: true, source: SOURCE, summary: SOURCE.lastRun });
    await run('knowledge', 'sync', 'src-1');
    expect(syncOne.execute).toHaveBeenCalledWith('src-1');
    expect(syncAll.runAll).not.toHaveBeenCalled();
  });

  it('lists the documents of a space', async () => {
    list.execute.mockResolvedValue({
      ok: true,
      space: { id: 's1', name: 'Acme', slug: 'acme' },
      documents: [
        {
          id: 'd1',
          sourceId: 'src-1',
          spaceId: 's1',
          pageId: 'p',
          title: 'Release process',
          url: 'https://notion.so/release',
          content: 'x',
          pageEditedAt: T,
          createdAt: T,
          updatedAt: T,
        },
      ],
    });
    const out = await run('knowledge', 'ls', '--space', 'acme');
    expect(list.execute).toHaveBeenCalledWith('acme');
    expect(out).toContain('Release process');
    expect(out).toContain('https://notion.so/release');
  });

  it('prints the passages an agent working in a repository would get', async () => {
    select.execute.mockResolvedValue({
      blob: '### Team knowledge',
      passages: [
        {
          title: 'Payments',
          heading: 'Refunds',
          url: 'https://notion.so/pay',
          text: 'Guest orders are refunded to the original card.',
        },
      ],
    });
    const out = await run('knowledge', 'search', 'refund guest orders', '--repo', '/src/pay');
    expect(select.execute).toHaveBeenCalledWith({
      repositoryPath: '/src/pay',
      taskText: 'refund guest orders',
    });
    expect(out).toContain('Payments › Refunds');
    expect(out).toContain('original card');
  });

  it('says when nothing matches', async () => {
    select.execute.mockResolvedValue({ blob: '', passages: [] });
    const out = await run('knowledge', 'search', 'nothing here');
    expect(select.execute).toHaveBeenCalledWith({
      repositoryPath: process.cwd(),
      taskText: 'nothing here',
    });
    expect(out).toContain('No team knowledge');
  });
});
