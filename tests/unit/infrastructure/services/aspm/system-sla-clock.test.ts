/**
 * SystemSlaClock unit test (feature 098, phase 6, task-32).
 *
 * The production clock adapter delegates to `new Date()` — we assert the
 * shape contract (returns a Date close to wall-clock) so a regression
 * (e.g. accidental string return) shows up in unit tests, not at runtime.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SystemSlaClock } from '@/infrastructure/services/aspm/system-sla-clock.js';

describe('SystemSlaClock', () => {
  it('returns a Date instance', () => {
    const result = new SystemSlaClock().now();
    expect(result).toBeInstanceOf(Date);
  });

  it('returns a time within 2s of wall-clock now', () => {
    const before = Date.now();
    const result = new SystemSlaClock().now().getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after + 2_000);
  });

  it('returns a fresh Date on every call (callers may mutate)', () => {
    const clock = new SystemSlaClock();
    const a = clock.now();
    const b = clock.now();
    expect(a).not.toBe(b);
  });
});
