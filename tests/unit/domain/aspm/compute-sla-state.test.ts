/**
 * computeSlaState — unit tests (feature 098, phase 6, task-33).
 *
 * Covers every SLA band, every boundary, every severity, and confirms the
 * function stays pure (no dependence on Date.now()).
 */

import { describe, it, expect } from 'vitest';
import {
  AT_RISK_THRESHOLD_FRACTION,
  MS_PER_DAY,
  computeSlaState,
} from '@/domain/aspm/sla/compute-sla-state.js';
import { CanonicalSeverity, SlaState, type SecurityPolicy } from '@/domain/generated/output.js';

function policy(
  windows: Partial<Record<CanonicalSeverity, number>> = {
    [CanonicalSeverity.Critical]: 7,
    [CanonicalSeverity.High]: 30,
    [CanonicalSeverity.Medium]: 90,
    [CanonicalSeverity.Low]: 180,
  }
): SecurityPolicy {
  return {
    id: 'policy-1',
    name: 'Default',
    active: true,
    slaWindows: Object.entries(windows).map(([severity, windowDays]) => ({
      severity: severity as CanonicalSeverity,
      windowDays: windowDays as number,
    })),
    maxIngestBytes: BigInt(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const DISCOVERED = new Date('2026-05-01T00:00:00.000Z');

function nowAfterDays(days: number): Date {
  return new Date(DISCOVERED.getTime() + days * MS_PER_DAY);
}

describe('computeSlaState — bands per severity', () => {
  const cases: { severity: CanonicalSeverity; windowDays: number }[] = [
    { severity: CanonicalSeverity.Critical, windowDays: 7 },
    { severity: CanonicalSeverity.High, windowDays: 30 },
    { severity: CanonicalSeverity.Medium, windowDays: 90 },
    { severity: CanonicalSeverity.Low, windowDays: 180 },
  ];

  it.each(cases)(
    'Healthy when elapsed < 50% of window for $severity',
    ({ severity, windowDays }) => {
      const state = computeSlaState({
        discoveredAt: DISCOVERED,
        severity,
        policy: policy(),
        now: nowAfterDays(windowDays * 0.25),
      });
      expect(state).toBe(SlaState.Healthy);
    }
  );

  it.each(cases)(
    'AtRisk when elapsed exactly at 50% boundary for $severity',
    ({ severity, windowDays }) => {
      const state = computeSlaState({
        discoveredAt: DISCOVERED,
        severity,
        policy: policy(),
        now: nowAfterDays(windowDays * AT_RISK_THRESHOLD_FRACTION),
      });
      expect(state).toBe(SlaState.AtRisk);
    }
  );

  it.each(cases)(
    'AtRisk when elapsed 75% through window for $severity',
    ({ severity, windowDays }) => {
      const state = computeSlaState({
        discoveredAt: DISCOVERED,
        severity,
        policy: policy(),
        now: nowAfterDays(windowDays * 0.75),
      });
      expect(state).toBe(SlaState.AtRisk);
    }
  );

  it.each(cases)(
    'Breached at exactly the window boundary for $severity',
    ({ severity, windowDays }) => {
      const state = computeSlaState({
        discoveredAt: DISCOVERED,
        severity,
        policy: policy(),
        now: nowAfterDays(windowDays),
      });
      expect(state).toBe(SlaState.Breached);
    }
  );

  it.each(cases)('Breached past the window for $severity', ({ severity, windowDays }) => {
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity,
      policy: policy(),
      now: nowAfterDays(windowDays * 2),
    });
    expect(state).toBe(SlaState.Breached);
  });
});

describe('computeSlaState — edge cases', () => {
  it('returns Healthy for Info severity regardless of elapsed time', () => {
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.Info,
      policy: policy(),
      now: nowAfterDays(10_000),
    });
    expect(state).toBe(SlaState.Healthy);
  });

  it('returns Healthy when the policy has no matching window for the severity', () => {
    const noCritical = policy({ [CanonicalSeverity.High]: 30 });
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.Critical,
      policy: noCritical,
      now: nowAfterDays(100),
    });
    expect(state).toBe(SlaState.Healthy);
  });

  it('returns Healthy when now equals discoveredAt (elapsed = 0)', () => {
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.Critical,
      policy: policy(),
      now: DISCOVERED,
    });
    expect(state).toBe(SlaState.Healthy);
  });

  it('clamps negative elapsed (clock skew, now before discoveredAt) to Healthy', () => {
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.Critical,
      policy: policy(),
      now: new Date(DISCOVERED.getTime() - 1_000),
    });
    expect(state).toBe(SlaState.Healthy);
  });

  it('treats a zero-day window as immediately Breached', () => {
    const state = computeSlaState({
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.Critical,
      policy: policy({ [CanonicalSeverity.Critical]: 0 }),
      now: DISCOVERED,
    });
    expect(state).toBe(SlaState.Breached);
  });
});

describe('computeSlaState — determinism', () => {
  it('produces identical output for identical inputs', () => {
    const inputs = {
      discoveredAt: DISCOVERED,
      severity: CanonicalSeverity.High,
      policy: policy(),
      now: nowAfterDays(20),
    } as const;
    expect(computeSlaState(inputs)).toBe(computeSlaState(inputs));
  });
});
