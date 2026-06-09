/**
 * RealClock Unit Tests
 *
 * Tests for the RealClock infrastructure service.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { RealClock } from '@/infrastructure/services/clock.js';

describe('RealClock', () => {
  it('returns a Date instance', () => {
    const clock = new RealClock();
    const result = clock.now();

    expect(result).toBeInstanceOf(Date);
  });

  it('returns a Date close to the current system time', () => {
    const clock = new RealClock();
    const before = Date.now();
    const result = clock.now();
    const after = Date.now();

    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });
});
