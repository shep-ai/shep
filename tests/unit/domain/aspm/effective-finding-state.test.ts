/**
 * effectiveFindingState — unit tests (feature 098, phase 6, task-35).
 *
 * Covers every branch: no exception, active+unexpired, active+expired,
 * revoked, soft-deleted. The function must NOT call Date.now() directly —
 * time is threaded in via `now`.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { effectiveFindingState } from '@/domain/aspm/exceptions/effective-finding-state.js';
import {
  ExceptionReason,
  FindingState,
  RiskExceptionStatus,
  type RiskException,
} from '@/domain/generated/output.js';

const NOW = new Date('2026-05-19T12:00:00.000Z');

function makeException(overrides: Partial<RiskException> = {}): RiskException {
  return {
    id: randomUUID(),
    findingId: randomUUID(),
    reason: ExceptionReason.FalsePositive,
    justification: 'manual review',
    declaredBy: randomUUID(),
    declaredAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    status: RiskExceptionStatus.Active,
    createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    updatedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('effectiveFindingState', () => {
  it('returns the raw state when no exception is present', () => {
    expect(effectiveFindingState({ rawState: FindingState.Open, exception: null, now: NOW })).toBe(
      FindingState.Open
    );
  });

  it('returns FindingState.Exception when an active, unexpired exception exists', () => {
    expect(
      effectiveFindingState({ rawState: FindingState.Open, exception: makeException(), now: NOW })
    ).toBe(FindingState.Exception);
  });

  it('falls back to the raw state when the active exception has expired', () => {
    const ex = makeException({
      expiresAt: new Date(NOW.getTime() - 60 * 1000),
    });
    expect(effectiveFindingState({ rawState: FindingState.Triaged, exception: ex, now: NOW })).toBe(
      FindingState.Triaged
    );
  });

  it('treats an exception expiring at exactly now as expired (boundary)', () => {
    const ex = makeException({ expiresAt: NOW });
    expect(effectiveFindingState({ rawState: FindingState.Open, exception: ex, now: NOW })).toBe(
      FindingState.Open
    );
  });

  it('returns the raw state for a revoked exception', () => {
    const ex = makeException({ status: RiskExceptionStatus.Revoked });
    expect(
      effectiveFindingState({ rawState: FindingState.InProgress, exception: ex, now: NOW })
    ).toBe(FindingState.InProgress);
  });

  it('returns the raw state for an Expired-status exception', () => {
    const ex = makeException({ status: RiskExceptionStatus.Expired });
    expect(
      effectiveFindingState({ rawState: FindingState.Resolved, exception: ex, now: NOW })
    ).toBe(FindingState.Resolved);
  });

  it('returns the raw state for a soft-deleted exception', () => {
    const ex = makeException({ deletedAt: new Date(NOW.getTime() - 1000) });
    expect(effectiveFindingState({ rawState: FindingState.Open, exception: ex, now: NOW })).toBe(
      FindingState.Open
    );
  });

  it('does not mutate the supplied exception or rawState', () => {
    const ex = makeException();
    const before = JSON.parse(JSON.stringify({ status: ex.status, expiresAt: ex.expiresAt }));
    effectiveFindingState({ rawState: FindingState.Open, exception: ex, now: NOW });
    expect(ex.status).toBe(before.status);
    expect(ex.expiresAt.toISOString()).toBe(before.expiresAt);
  });
});
