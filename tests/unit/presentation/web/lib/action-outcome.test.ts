import { describe, it, expect } from 'vitest';
import {
  attemptOutcome,
  errorMessage,
  runsOutcome,
} from '../../../../../src/presentation/web/lib/action-outcome.js';

describe('action-outcome', () => {
  it('reads the message of anything thrown', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
  });

  it('keeps only success or the error of a result', async () => {
    expect(await attemptOutcome(async () => ({ ok: true, secret: 'x' }))).toEqual({ ok: true });
    expect(await attemptOutcome(async () => ({ ok: false, error: 'No such thing' }))).toEqual({
      ok: false,
      error: 'No such thing',
    });
    expect(
      await attemptOutcome(async () => {
        throw new Error('database is locked');
      })
    ).toEqual({ ok: false, error: 'database is locked' });
  });

  it('fails runs with the first refusal or early stop', async () => {
    expect(await runsOutcome(async () => [{ ok: true }, { ok: true }])).toEqual({ ok: true });
    expect(
      await runsOutcome(async () => [{ ok: true }, { ok: true, error: 'rate limited' }])
    ).toEqual({ ok: false, error: 'rate limited' });
    expect(await runsOutcome(async () => [{ ok: false, error: 'No source' }])).toEqual({
      ok: false,
      error: 'No source',
    });
  });
});
