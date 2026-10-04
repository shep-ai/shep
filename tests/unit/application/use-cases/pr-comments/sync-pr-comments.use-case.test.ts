import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SyncPrCommentsUseCase } from '@/application/use-cases/pr-comments/sync-pr-comments.use-case.js';
import type { FetchPrCommentsUseCase } from '@/application/use-cases/pr-comments/fetch-pr-comments.use-case.js';
import type { AddressPrCommentsUseCase } from '@/application/use-cases/pr-comments/address-pr-comments.use-case.js';
import {
  PrCommentStatus,
  PrCommentTrigger,
  PrStatus,
  SdlcLifecycle,
  type Feature,
  type PrComment,
} from '@/domain/generated/output.js';
import { FEATURE, fakeFeatures, fakeSpaceEnvironment, stored } from './pr-comments.fixtures.js';

const MENTION = stored({ id: 'c1', body: '#shep rename it' });
const PLAIN = stored({ id: 'c2', githubId: '2', body: 'rename it' });
const FAILED = stored({ id: 'c3', githubId: '3', body: '#shep x', status: PrCommentStatus.Failed });

function setup(
  trigger: PrCommentTrigger | undefined,
  comments: PrComment[] = [MENTION, PLAIN, FAILED]
) {
  const fetch = {
    execute: vi.fn(async () => ({ ok: true, feature: FEATURE, comments, added: 1 })),
  };
  const address = {
    start: vi.fn(async () => ({ ok: true, round: { id: 'r1' }, comments: [] })),
    run: vi.fn(async () => ({ id: 'r1' })),
  };
  const merged = { ...FEATURE, id: 'feat-merged', pr: { ...FEATURE.pr, status: PrStatus.Merged } };
  const building = { ...FEATURE, id: 'feat-building', lifecycle: SdlcLifecycle.Implementation };
  const useCase = new SyncPrCommentsUseCase(
    fakeFeatures([FEATURE, merged, building] as Feature[]),
    fetch as unknown as FetchPrCommentsUseCase,
    address as unknown as AddressPrCommentsUseCase,
    fakeSpaceEnvironment(trigger ? { trigger } : {})
  );
  return { useCase, fetch, address };
}

describe('SyncPrCommentsUseCase', () => {
  it('reads the comments of features in review with an open pull request', async () => {
    const { useCase, fetch } = setup(PrCommentTrigger.Off);
    const summary = await useCase.runDue();
    expect(fetch.execute).toHaveBeenCalledTimes(1);
    expect(fetch.execute).toHaveBeenCalledWith(FEATURE.id);
    expect(summary).toEqual({ features: 1, added: 1, rounds: 0, errors: [] });
  });

  it('addresses mentions by default and in Mention mode, never failed ones', async () => {
    for (const trigger of [undefined, PrCommentTrigger.Mention]) {
      const { useCase, address } = setup(trigger);
      const summary = await useCase.runDue();
      expect(address.start).toHaveBeenCalledWith({ feature: FEATURE.id, commentIds: ['c1'] });
      expect(address.run).toHaveBeenCalledWith('r1');
      expect(summary.rounds).toBe(1);
    }
  });

  it('addresses every pending comment in All mode, and none when Off', async () => {
    const all = setup(PrCommentTrigger.All);
    await all.useCase.runDue();
    expect(all.address.start).toHaveBeenCalledWith({
      feature: FEATURE.id,
      commentIds: ['c1', 'c2'],
    });

    const off = setup(PrCommentTrigger.Off);
    await off.useCase.runDue();
    expect(off.address.start).not.toHaveBeenCalled();
  });

  it('starts nothing when no comment qualifies', async () => {
    const { useCase, address } = setup(PrCommentTrigger.Mention, [PLAIN]);
    await useCase.runDue();
    expect(address.start).not.toHaveBeenCalled();
  });

  it('records a feature that failed and carries on', async () => {
    const { useCase, fetch, address } = setup(PrCommentTrigger.Mention);
    fetch.execute.mockRejectedValueOnce(new Error('gh: HTTP 502'));
    expect((await useCase.runDue()).errors).toEqual([`${FEATURE.name}: gh: HTTP 502`]);

    address.start.mockResolvedValueOnce({ ok: false, error: 'already addressing' } as never);
    const quiet = await useCase.runDue();
    expect(quiet.errors).toEqual([]);
    expect(address.run).not.toHaveBeenCalled();
  });
});
