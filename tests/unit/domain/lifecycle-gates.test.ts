/**
 * Lifecycle Gates Unit Tests
 *
 * Guards invariants about the SdlcLifecycle enum and lifecycle gate sets.
 */

import { describe, it, expect } from 'vitest';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import { POST_IMPLEMENTATION } from '@/domain/lifecycle-gates.js';

describe('SdlcLifecycle', () => {
  it('should include a Pending value', () => {
    expect(SdlcLifecycle.Pending).toBe('Pending');
  });

  it('should include an Exploring value', () => {
    expect(SdlcLifecycle.Exploring).toBe('Exploring');
  });
});

describe('POST_IMPLEMENTATION', () => {
  it('should NOT contain SdlcLifecycle.Pending', () => {
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Pending)).toBe(false);
  });

  it('should contain Implementation, Review, and Maintain', () => {
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Implementation)).toBe(true);
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Review)).toBe(true);
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Maintain)).toBe(true);
  });
});
