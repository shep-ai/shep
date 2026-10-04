import { describe, it, expect } from 'vitest';
import {
  PR_COMMENT_ROUND_STALE_AFTER_MS,
  SHEP_REPLY_MARKER,
  formatReply,
  isAutoAddressed,
  isRoundStale,
  isShepReply,
  mentionsShep,
  quoteForReply,
} from '@/domain/shared/pr-comments.js';
import { PrCommentRoundStatus, PrCommentTrigger } from '@/domain/generated/output.js';

describe('mentionsShep', () => {
  it.each([
    ['#shep rename this', true],
    ['please #Shep, rename', true],
    ['(#shep)', true],
    ['#shepherd is a dog', false],
    ['issue #shep-1', false],
    ['shep rename this', false],
    ['email#shep', false],
  ])('%s → %s', (body, expected) => {
    expect(mentionsShep(body)).toBe(expected);
  });
});

describe('isAutoAddressed', () => {
  it('addresses nothing when Off, mentions when Mention or unset, everything when All', () => {
    expect(isAutoAddressed(PrCommentTrigger.Off, '#shep fix')).toBe(false);
    expect(isAutoAddressed(PrCommentTrigger.Mention, '#shep fix')).toBe(true);
    expect(isAutoAddressed(PrCommentTrigger.Mention, 'fix')).toBe(false);
    expect(isAutoAddressed(undefined, '#shep fix')).toBe(true);
    expect(isAutoAddressed(undefined, 'fix')).toBe(false);
    expect(isAutoAddressed(PrCommentTrigger.All, 'fix')).toBe(true);
  });
});

describe('replies', () => {
  it('end with the marker, name the commit, and are recognised as shep replies', () => {
    const body = formatReply('  Renamed to totalCents.  ', 'c0ffee1234567');
    expect(body).toBe(`Renamed to totalCents.\n\nChanged in c0ffee1.\n\n${SHEP_REPLY_MARKER}`);
    expect(isShepReply(body)).toBe(true);
    expect(formatReply('Answered.')).toBe(`Answered.\n\n${SHEP_REPLY_MARKER}`);
    expect(isShepReply('a normal comment')).toBe(false);
  });

  it('quote the start of the comment they answer', () => {
    expect(quoteForReply('ada', 'line one\nline two\nline three\nline four')).toBe(
      '> @ada: line one\n> line two\n> line three\n> …\n\n'
    );
    expect(quoteForReply('ada', 'short')).toBe('> @ada: short\n\n');
  });
});

describe('isRoundStale', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('only for a running round not updated within the budget', () => {
    const old = new Date(now.getTime() - PR_COMMENT_ROUND_STALE_AFTER_MS - 1);
    expect(isRoundStale({ status: PrCommentRoundStatus.Running, updatedAt: old }, now)).toBe(true);
    expect(isRoundStale({ status: PrCommentRoundStatus.Running, updatedAt: now }, now)).toBe(false);
    expect(isRoundStale({ status: PrCommentRoundStatus.Failed, updatedAt: old }, now)).toBe(false);
  });
});
