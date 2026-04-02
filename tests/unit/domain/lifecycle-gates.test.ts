/**
 * Lifecycle Gates Unit Tests
 *
 * Guards invariants about the SdlcLifecycle enum and lifecycle gate sets.
 */

import { describe, it, expect } from 'vitest';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import { POST_IMPLEMENTATION, EXPLORING_TRANSITIONS } from '@/domain/lifecycle-gates.js';

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

  it('should NOT contain SdlcLifecycle.Exploring', () => {
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Exploring)).toBe(false);
  });

  it('should contain Implementation, Review, and Maintain', () => {
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Implementation)).toBe(true);
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Review)).toBe(true);
    expect(POST_IMPLEMENTATION.has(SdlcLifecycle.Maintain)).toBe(true);
  });
});

describe('EXPLORING_TRANSITIONS', () => {
  it('should allow transition from Exploring to Implementation (promote to fast)', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Implementation)).toBe(true);
  });

  it('should allow transition from Exploring to Requirements (promote to regular)', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Requirements)).toBe(true);
  });

  it('should allow transition from Exploring to Deleting (discard)', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Deleting)).toBe(true);
  });

  it('should contain exactly 3 valid transitions', () => {
    expect(EXPLORING_TRANSITIONS.size).toBe(3);
  });

  it('should NOT allow transition from Exploring to Review', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Review)).toBe(false);
  });

  it('should NOT allow transition from Exploring to Maintain', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Maintain)).toBe(false);
  });

  it('should NOT allow transition from Exploring to Exploring (self-loop is implicit)', () => {
    expect(EXPLORING_TRANSITIONS.has(SdlcLifecycle.Exploring)).toBe(false);
  });
});
