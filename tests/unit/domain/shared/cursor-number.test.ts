/**
 * Cursor Number Normalization unit tests
 */

import { describe, it, expect } from 'vitest';

import { integerOrFallback } from '@/domain/shared/cursor-number';

describe('integerOrFallback', () => {
  it('passes an integer through untouched', () => {
    expect(integerOrFallback(0, 25)).toBe(0);
    expect(integerOrFallback(50, 25)).toBe(50);
    expect(integerOrFallback(-1, 25)).toBe(-1);
    // `3.0` is the same JS number as `3`, and SQLite accepts it as an integer.
    expect(integerOrFallback(3.0, 25)).toBe(3);
  });

  it('uses the fallback when the value is absent', () => {
    expect(integerOrFallback(undefined, 25)).toBe(25);
  });

  it('uses the fallback for NaN — the clamp cannot catch it', () => {
    // Math.min(200, Math.max(1, NaN)) is NaN, so without this guard the value
    // reaches `LIMIT ? OFFSET ?` and SQLite rejects the bind.
    expect(integerOrFallback(NaN, 25)).toBe(25);
    expect(integerOrFallback(Number('abc'), 25)).toBe(25);
  });

  it('uses the fallback for both infinities', () => {
    expect(integerOrFallback(Number.POSITIVE_INFINITY, 25)).toBe(25);
    expect(integerOrFallback(Number.NEGATIVE_INFINITY, 25)).toBe(25);
    // A flag that overflows to Infinity rather than a plain typo.
    expect(integerOrFallback(Number('1e999'), 25)).toBe(25);
  });

  it('uses the fallback for a fractional number — SQLite rejects it like NaN', () => {
    // `--limit 2.5` is finite, so a finiteness check lets it through, but
    // `LIMIT 2.5` raises the same datatype mismatch as `LIMIT NaN`.
    expect(integerOrFallback(2.5, 25)).toBe(25);
    expect(integerOrFallback(0.5, 25)).toBe(25);
    expect(integerOrFallback(Number('1.9999'), 25)).toBe(25);
  });

  it('can fall back to undefined so the repository applies its own default', () => {
    expect(integerOrFallback(2.5, undefined)).toBeUndefined();
    expect(integerOrFallback(NaN, undefined)).toBeUndefined();
    expect(integerOrFallback(10, undefined)).toBe(10);
  });
});
