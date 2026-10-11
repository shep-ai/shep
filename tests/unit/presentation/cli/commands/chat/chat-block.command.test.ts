/**
 * shep chat block (spec 137) — how an agent with a shell posts a rich block
 * into the conversation it is chatting in.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatBlockType } from '@/domain/generated/output.js';
import { InvalidChatBlockError } from '@/domain/errors/invalid-chat-block.error.js';
import { CHAT_SCOPE_ENV_VAR } from '@/domain/shared/chat-scope.js';

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

import { initI18n } from '../../../../../../src/presentation/cli/i18n.js';
import { createChatCommand } from '../../../../../../src/presentation/cli/commands/chat/index.js';

describe('shep chat block', () => {
  const post = vi.fn();
  let logs: string[];
  let dir: string;
  const previousScope = process.env[CHAT_SCOPE_ENV_VAR];

  beforeAll(async () => {
    await initI18n('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    process.exitCode = undefined;
    delete process.env[CHAT_SCOPE_ENV_VAR];
    dir = mkdtempSync(join(tmpdir(), 'shep-chat-block-'));
    post.mockResolvedValue({ block: { id: 'block-1' }, message: { id: 'm1' } });
    mockResolve.mockImplementation((token: { name?: string }) => {
      if (token.name === 'PostChatBlockUseCase') return { execute: post };
      throw new Error(`unexpected token ${String(token.name)}`);
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (previousScope === undefined) delete process.env[CHAT_SCOPE_ENV_VAR];
    else process.env[CHAT_SCOPE_ENV_VAR] = previousScope;
  });

  async function run(...args: string[]) {
    await createChatCommand().parseAsync(['block', ...args], { from: 'user' });
  }

  it('posts a plan from a file into the conversation named by SHEP_CHAT_SCOPE', async () => {
    process.env[CHAT_SCOPE_ENV_VAR] = 'repo-r1';
    const file = join(dir, 'plan.md');
    writeFileSync(file, '1. Tokens\n2. Toggle');

    await run('plan', '--title', 'Dark mode', '--file', file);

    expect(post).toHaveBeenCalledWith({
      scope: 'repo-r1',
      type: ChatBlockType.PlanCard,
      title: 'Dark mode',
      markdown: '1. Tokens\n2. Toggle',
    });
    expect(process.exitCode).toBeUndefined();
    expect(logs.join('\n')).toContain('block-1');
  });

  it('sends HTML previews as html and spec reviews as Markdown', async () => {
    await run('preview', '--scope', 'global', '--title', 'Card', '--content', '<b>Hi</b>');
    await run('spec-review', '--scope', 'global', '--title', 'PRD', '--content', '# PRD');

    expect(post).toHaveBeenNthCalledWith(1, {
      scope: 'global',
      type: ChatBlockType.HtmlPreview,
      title: 'Card',
      html: '<b>Hi</b>',
    });
    expect(post).toHaveBeenNthCalledWith(2, {
      scope: 'global',
      type: ChatBlockType.SpecReview,
      title: 'PRD',
      markdown: '# PRD',
    });
  });

  it('prefers an explicit --scope over the environment', async () => {
    process.env[CHAT_SCOPE_ENV_VAR] = 'repo-r1';
    await run('plan', '--scope', 'global', '--title', 'P', '--content', 'm');
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ scope: 'global' }));
  });

  it.each([
    [
      'no conversation is known',
      ['plan', '--title', 'P', '--content', 'm'],
      'No chat conversation',
    ],
    [
      'the kind is unknown',
      ['chart', '--scope', 'global', '--title', 'P', '--content', 'm'],
      'Unknown block kind',
    ],
    [
      'neither --file nor --content is given',
      ['plan', '--scope', 'global', '--title', 'P'],
      'Pass --file or --content',
    ],
    [
      'both --file and --content are given',
      ['plan', '--scope', 'global', '--title', 'P', '--content', 'm', '--file', 'x.md'],
      'Pass --file or --content',
    ],
  ])('fails with a message when %s', async (_label, args, expected) => {
    await run(...args);
    expect(post).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toContain(expected);
  });

  it('reports a file it cannot read', async () => {
    await run('plan', '--scope', 'global', '--title', 'P', '--file', join(dir, 'missing.md'));
    expect(post).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toContain('Could not read');
  });

  it('prints the validation message the use case gives', async () => {
    post.mockRejectedValue(new InvalidChatBlockError('The title is longer than 200 characters.'));
    await run('plan', '--scope', 'global', '--title', 'P', '--content', 'm');
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toContain('The title is longer than 200 characters.');
  });
});
