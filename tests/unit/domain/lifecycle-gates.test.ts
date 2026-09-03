/**
 * Lifecycle Gates Unit Tests
 *
 * Guards invariants about the SdlcLifecycle enum and lifecycle gate sets.
 */

import { describe, it, expect } from 'vitest';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import {
  COMPLETED_LIFECYCLES,
  EXPLORING_TRANSITIONS,
  GATE_EXEMPT_LIFECYCLES,
  allowsLifecycleWrite,
  satisfiesDependencyGate,
} from '@/domain/lifecycle-gates.js';

describe('SdlcLifecycle', () => {
  it('should include a Pending value', () => {
    expect(SdlcLifecycle.Pending).toBe('Pending');
  });

  it('should include an Exploring value', () => {
    expect(SdlcLifecycle.Exploring).toBe('Exploring');
  });
});

describe('COMPLETED_LIFECYCLES', () => {
  it('should NOT contain SdlcLifecycle.Pending', () => {
    expect(COMPLETED_LIFECYCLES.has(SdlcLifecycle.Pending)).toBe(false);
  });

  it('should NOT contain SdlcLifecycle.Exploring', () => {
    expect(COMPLETED_LIFECYCLES.has(SdlcLifecycle.Exploring)).toBe(false);
  });

  it('should contain Maintain — the only lifecycle meaning the work landed', () => {
    expect(COMPLETED_LIFECYCLES.has(SdlcLifecycle.Maintain)).toBe(true);
    expect(COMPLETED_LIFECYCLES.size).toBe(1);
  });

  it('should NOT contain Implementation or Review — that work has not landed yet', () => {
    expect(COMPLETED_LIFECYCLES.has(SdlcLifecycle.Implementation)).toBe(false);
    expect(COMPLETED_LIFECYCLES.has(SdlcLifecycle.Review)).toBe(false);
  });
});

describe('satisfiesDependencyGate', () => {
  it('should open the gate only for Maintain', () => {
    expect(satisfiesDependencyGate({ lifecycle: SdlcLifecycle.Maintain })).toBe(true);
  });

  it('should keep the gate CLOSED while the parent is still implementing', () => {
    // The merge node sets Maintain only when the branch actually merged, and
    // Review when the PR is still open. A child that starts against either one
    // builds on work that can still change or may never land.
    expect(satisfiesDependencyGate({ lifecycle: SdlcLifecycle.Implementation })).toBe(false);
    expect(satisfiesDependencyGate({ lifecycle: SdlcLifecycle.Review })).toBe(false);
  });

  it('should keep the gate closed for pre-implementation states', () => {
    for (const lifecycle of [
      SdlcLifecycle.Started,
      SdlcLifecycle.Analyze,
      SdlcLifecycle.Requirements,
      SdlcLifecycle.Research,
      SdlcLifecycle.Planning,
      SdlcLifecycle.Pending,
      SdlcLifecycle.Exploring,
      SdlcLifecycle.Blocked,
      SdlcLifecycle.AwaitingUpstream,
      SdlcLifecycle.Deleting,
    ]) {
      expect(satisfiesDependencyGate({ lifecycle })).toBe(false);
    }
  });

  it('should keep the gate OPEN for a feature archived after it completed', () => {
    // Auto-archive moves every completed feature to Archived on a delay.
    // Archiving is a filing concern, not a rollback of progress — children
    // waiting on a completed-then-archived parent must still be released.
    expect(
      satisfiesDependencyGate({
        lifecycle: SdlcLifecycle.Archived,
        previousLifecycle: SdlcLifecycle.Maintain,
      })
    ).toBe(true);
  });

  it('should keep the gate CLOSED for a feature archived before it completed', () => {
    for (const previousLifecycle of [
      SdlcLifecycle.Planning,
      SdlcLifecycle.Implementation,
      SdlcLifecycle.Review,
    ]) {
      expect(
        satisfiesDependencyGate({ lifecycle: SdlcLifecycle.Archived, previousLifecycle })
      ).toBe(false);
    }
  });

  it('should keep the gate CLOSED for an archived feature with no recorded previous lifecycle', () => {
    expect(satisfiesDependencyGate({ lifecycle: SdlcLifecycle.Archived })).toBe(false);
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

describe('GATE_EXEMPT_LIFECYCLES', () => {
  it('should contain only the non-progress targets a Blocked feature may still reach', () => {
    expect([...GATE_EXEMPT_LIFECYCLES].sort()).toEqual(
      [SdlcLifecycle.Archived, SdlcLifecycle.Blocked, SdlcLifecycle.Deleting].sort()
    );
  });

  it('should NOT contain any working lifecycle', () => {
    for (const lifecycle of [
      SdlcLifecycle.Started,
      SdlcLifecycle.Requirements,
      SdlcLifecycle.Research,
      SdlcLifecycle.Planning,
      SdlcLifecycle.Implementation,
      SdlcLifecycle.Review,
      SdlcLifecycle.Maintain,
    ]) {
      expect(GATE_EXEMPT_LIFECYCLES.has(lifecycle)).toBe(false);
    }
  });
});

describe('allowsLifecycleWrite', () => {
  const blockedChild = { lifecycle: SdlcLifecycle.Blocked, parentId: 'parent-1' };

  it('should allow any write to a feature that is not Blocked', () => {
    expect(
      allowsLifecycleWrite(
        { lifecycle: SdlcLifecycle.Implementation, parentId: 'parent-1' },
        { lifecycle: SdlcLifecycle.Requirements },
        SdlcLifecycle.Review
      )
    ).toBe(true);
  });

  it('should refuse to advance a Blocked feature whose parent has not landed', () => {
    for (const parentLifecycle of [
      SdlcLifecycle.Pending,
      SdlcLifecycle.Started,
      SdlcLifecycle.Requirements,
      SdlcLifecycle.Research,
      SdlcLifecycle.Planning,
      SdlcLifecycle.Implementation,
      SdlcLifecycle.Review,
      SdlcLifecycle.Blocked,
    ]) {
      expect(
        allowsLifecycleWrite(
          blockedChild,
          { lifecycle: parentLifecycle },
          SdlcLifecycle.Implementation
        )
      ).toBe(false);
    }
  });

  it('should allow advancing a Blocked feature once its parent reached Maintain', () => {
    expect(
      allowsLifecycleWrite(
        blockedChild,
        { lifecycle: SdlcLifecycle.Maintain },
        SdlcLifecycle.Requirements
      )
    ).toBe(true);
  });

  it('should allow advancing a Blocked feature under a parent archived after completing', () => {
    expect(
      allowsLifecycleWrite(
        blockedChild,
        { lifecycle: SdlcLifecycle.Archived, previousLifecycle: SdlcLifecycle.Maintain },
        SdlcLifecycle.Requirements
      )
    ).toBe(true);
  });

  it('should allow the gate-exempt targets even while the gate is closed', () => {
    for (const target of GATE_EXEMPT_LIFECYCLES) {
      expect(
        allowsLifecycleWrite(blockedChild, { lifecycle: SdlcLifecycle.Planning }, target)
      ).toBe(true);
    }
  });

  it('should allow a Blocked feature with no parent to move on', () => {
    expect(
      allowsLifecycleWrite({ lifecycle: SdlcLifecycle.Blocked }, null, SdlcLifecycle.Requirements)
    ).toBe(true);
  });

  it('should allow a Blocked feature whose parent cannot be loaded to move on', () => {
    // A dangling parentId must not strand the child — nothing is left to release it.
    expect(allowsLifecycleWrite(blockedChild, null, SdlcLifecycle.Requirements)).toBe(true);
  });
});
