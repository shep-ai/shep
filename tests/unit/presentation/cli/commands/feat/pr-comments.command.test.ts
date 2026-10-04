/**
 * `shep feat comments` and `shep feat address-comments` (spec 124): thin
 * commands over the PR comment use cases.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PrCommentKind,
  PrCommentRoundStatus,
  PrCommentStatus,
  type PrComment,
} from '@/domain/generated/output.js';

const { fetch, address, list } = vi.hoisted(() => ({
  fetch: { execute: vi.fn() },
  address: { start: vi.fn(), run: vi.fn() },
  list: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      if (name === 'FetchPrCommentsUseCase') return fetch;
      if (name === 'AddressPrCommentsUseCase') return address;
      if (name === 'GetPrCommentsUseCase') return list;
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createCommentsCommand } from '../../../../../../src/presentation/cli/commands/feat/comments.command.js';
import { createAddressCommentsCommand } from '../../../../../../src/presentation/cli/commands/feat/address-comments.command.js';

const T = new Date('2026-10-05T10:00:00Z');
const FEATURE = { id: 'feat-1234', name: 'Refund guests' };
const COMMENT: PrComment = {
  id: 'c0ffee00-1111-2222-3333-444455556666',
  featureId: FEATURE.id,
  githubId: '301',
  kind: PrCommentKind.Inline,
  author: 'ada',
  body: '#shep rename total to totalCents\nsecond line',
  path: 'src/refund.ts',
  line: 42,
  url: 'u',
  writtenAt: T,
  status: PrCommentStatus.Pending,
  createdAt: T,
  updatedAt: T,
};
const ROUND = {
  id: 'r1',
  featureId: FEATURE.id,
  commentIds: [COMMENT.id],
  status: PrCommentRoundStatus.Completed,
  commitSha: 'bbbbbbbbbbbb',
  createdAt: T,
  updatedAt: T,
};

async function run(command: 'comments' | 'address', ...args: string[]): Promise<string> {
  const cmd = command === 'comments' ? createCommentsCommand() : createAddressCommentsCommand();
  await cmd.parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep feat comments / address-comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
    fetch.execute.mockResolvedValue({ ok: true, feature: FEATURE, comments: [COMMENT], added: 1 });
    list.execute.mockResolvedValue({ ok: true, feature: FEATURE, comments: [COMMENT], rounds: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('comments reads GitHub, then lists each comment with a short id and where it is', async () => {
    const out = await run('comments', 'feat-1234');
    expect(fetch.execute).toHaveBeenCalledWith('feat-1234');
    expect(out).toContain('c0ffee00');
    expect(out).not.toContain('c0ffee00-1111');
    expect(out).toContain('src/refund.ts:42');
    expect(out).toContain('#shep rename total to totalCents');
    expect(out).not.toContain('second line');
    expect(out).toContain('shep feat address-comments feat-1234');
  });

  it('comments --no-refresh only reads what is stored, and shows the last round', async () => {
    list.execute.mockResolvedValue({
      ok: true,
      feature: FEATURE,
      comments: [{ ...COMMENT, status: PrCommentStatus.Addressed, reply: 'Renamed.' }],
      rounds: [ROUND],
    });
    const out = await run('comments', 'feat-1234', '--no-refresh');
    expect(fetch.execute).not.toHaveBeenCalled();
    expect(out).toContain('Renamed.');
    expect(out).toContain('bbbbbbb');
  });

  it('comments prints a refusal and exits 1', async () => {
    fetch.execute.mockResolvedValue({
      ok: false,
      error: 'Refund guests has no open pull request.',
    });
    const out = await run('comments', 'feat-1234');
    expect(out).toContain('no open pull request');
    expect(process.exitCode).toBe(1);
  });

  it('address-comments refreshes, starts a round on the named comments and runs it', async () => {
    address.start.mockResolvedValue({ ok: true, round: ROUND, comments: [COMMENT] });
    address.run.mockResolvedValue(ROUND);
    list.execute.mockResolvedValue({
      ok: true,
      feature: FEATURE,
      comments: [{ ...COMMENT, status: PrCommentStatus.Addressed, roundId: 'r1', reply: 'Done.' }],
      rounds: [ROUND],
    });
    const out = await run('address', 'feat-1234', 'c0ffee00');
    expect(fetch.execute).toHaveBeenCalledWith('feat-1234');
    expect(address.start).toHaveBeenCalledWith({ feature: 'feat-1234', commentIds: ['c0ffee00'] });
    expect(address.run).toHaveBeenCalledWith('r1');
    expect(out).toContain('Done.');
    expect(process.exitCode).toBeUndefined();
  });

  it('address-comments exits 1 when the round fails', async () => {
    address.start.mockResolvedValue({ ok: true, round: ROUND, comments: [COMMENT] });
    address.run.mockResolvedValue({
      ...ROUND,
      status: PrCommentRoundStatus.Failed,
      commitSha: undefined,
      error: 'Could not push bbbbbbb: rejected',
    });
    const out = await run('address', 'feat-1234', '--no-refresh');
    expect(fetch.execute).not.toHaveBeenCalled();
    expect(address.start).toHaveBeenCalledWith({ feature: 'feat-1234' });
    expect(out).toContain('Could not push');
    expect(process.exitCode).toBe(1);
  });

  it('address-comments prints a refusal', async () => {
    address.start.mockResolvedValue({
      ok: false,
      error: 'Refund guests is already addressing comments.',
    });
    expect(await run('address', 'feat-1234')).toContain('already addressing');
    expect(address.run).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
