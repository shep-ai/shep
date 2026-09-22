/**
 * Cursor Number Normalization unit tests
 */

import { describe, it, expect } from 'vitest';

import { finiteOrFallback } from '@/domain/shared/cursor-number';

describe('finiteOrFallback', () => {
  it('passes a finite number through untouched', () => {
    expect(finiteOrFallback(0, 25)).toBe(0);
    expect(finiteOrFallback(50, 25)).toBe(50);
    expect(finiteOrFallback(-1, 25)).toBe(-1);
  });

  it('uses the fallback when the value is absent', () => {
    expect(finiteOrFallback(undefined, 25)).toBe(25);
  });

  it('uses the fallback for NaN — the clamp cannot catch it', () => {
    // Math.min(200, Math.max(1, NaN)) is NaN, so without this guard the value
    // reaches `LIMIT ? OFFSET ?` and SQLite rejects the bind.
    expect(finiteOrFallback(NaN, 25)).toBe(25);
    expect(finiteOrFallback(Number('abc'), 25)).toBe(25);
  });

  it('uses the fallback for both infinities', () => {
    expect(finiteOrFallback(Number.POSITIVE_INFINITY, 25)).toBe(25);
    expect(finiteOrFallback(Number.NEGATIVE_INFINITY, 25)).toBe(25);
    // A flag that overflows to Infinity rather than a plain typo.
    expect(finiteOrFallback(Number('1e999'), 25)).toBe(25);
  });
});
