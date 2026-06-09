/**
 * Unit tests for the pure-domain composite risk-score function.
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-26.
 * Covers each contribution dimension independently + determinism +
 * graceful degradation when optional inputs are absent.
 */

import { describe, it, expect } from 'vitest';

import {
  computeRiskScore,
  hashInputs,
  type RiskScoreInputs,
} from '@/domain/aspm/scoring/compute-risk-score.js';
import {
  CanonicalSeverity,
  Criticality,
  DataClassification,
  Exposure,
} from '@/domain/generated/output.js';
import {
  MAX_CRITICALITY_CONTRIBUTION,
  MAX_CVSS_CONTRIBUTION,
  MAX_DATA_CLASSIFICATION_CONTRIBUTION,
  MAX_EPSS_CONTRIBUTION,
  MAX_EXPOSURE_CONTRIBUTION,
  MAX_KEV_CONTRIBUTION,
} from '@/domain/aspm/scoring/weights.js';

const MINIMAL_INFO: RiskScoreInputs = {
  canonicalSeverity: CanonicalSeverity.Info,
};

describe('computeRiskScore — CVSS contribution', () => {
  it('returns the full CVSS contribution when severity is Critical', () => {
    const result = computeRiskScore({ canonicalSeverity: CanonicalSeverity.Critical });
    expect(result.cvssContribution).toBe(MAX_CVSS_CONTRIBUTION);
  });

  it('returns zero CVSS contribution when severity is Info', () => {
    const result = computeRiskScore({ canonicalSeverity: CanonicalSeverity.Info });
    expect(result.cvssContribution).toBe(0);
  });

  it('uses an explicit CVSS base when supplied (prefers over canonical mapping)', () => {
    const result = computeRiskScore({
      canonicalSeverity: CanonicalSeverity.Low,
      cvssBase: 10,
    });
    expect(result.cvssContribution).toBe(MAX_CVSS_CONTRIBUTION);
  });

  it('clamps an out-of-range CVSS base to [0, 10]', () => {
    const overshoot = computeRiskScore({
      canonicalSeverity: CanonicalSeverity.Critical,
      cvssBase: 25,
    });
    expect(overshoot.cvssContribution).toBe(MAX_CVSS_CONTRIBUTION);

    const undershoot = computeRiskScore({
      canonicalSeverity: CanonicalSeverity.Critical,
      cvssBase: -5,
    });
    expect(undershoot.cvssContribution).toBe(0);
  });
});

describe('computeRiskScore — EPSS contribution', () => {
  it('is zero when EPSS is undefined', () => {
    const result = computeRiskScore(MINIMAL_INFO);
    expect(result.epssContribution).toBe(0);
  });

  it('scales linearly with the EPSS percentile', () => {
    const half = computeRiskScore({ ...MINIMAL_INFO, epssPercentile: 0.5 });
    expect(half.epssContribution).toBeCloseTo(MAX_EPSS_CONTRIBUTION / 2, 2);
  });

  it('saturates at the maximum when EPSS is 1', () => {
    const full = computeRiskScore({ ...MINIMAL_INFO, epssPercentile: 1 });
    expect(full.epssContribution).toBe(MAX_EPSS_CONTRIBUTION);
  });

  it('clamps EPSS values outside [0, 1]', () => {
    expect(computeRiskScore({ ...MINIMAL_INFO, epssPercentile: 2 }).epssContribution).toBe(
      MAX_EPSS_CONTRIBUTION
    );
    expect(computeRiskScore({ ...MINIMAL_INFO, epssPercentile: -1 }).epssContribution).toBe(0);
  });
});

describe('computeRiskScore — KEV contribution', () => {
  it('is zero when KEV is undefined', () => {
    expect(computeRiskScore(MINIMAL_INFO).kevContribution).toBe(0);
  });

  it('is zero when KEV is false', () => {
    expect(computeRiskScore({ ...MINIMAL_INFO, kev: false }).kevContribution).toBe(0);
  });

  it('adds the full KEV boost when true', () => {
    expect(computeRiskScore({ ...MINIMAL_INFO, kev: true }).kevContribution).toBe(
      MAX_KEV_CONTRIBUTION
    );
  });
});

describe('computeRiskScore — Exposure contribution', () => {
  it('is zero when exposure is undefined', () => {
    expect(computeRiskScore(MINIMAL_INFO).exposureContribution).toBe(0);
  });

  it('scales from Internet > Internal > Airgapped', () => {
    const inet = computeRiskScore({ ...MINIMAL_INFO, exposure: Exposure.Internet });
    const intl = computeRiskScore({ ...MINIMAL_INFO, exposure: Exposure.Internal });
    const air = computeRiskScore({ ...MINIMAL_INFO, exposure: Exposure.Airgapped });
    expect(inet.exposureContribution).toBe(MAX_EXPOSURE_CONTRIBUTION);
    expect(intl.exposureContribution).toBeLessThan(inet.exposureContribution);
    expect(air.exposureContribution).toBeLessThan(intl.exposureContribution);
  });
});

describe('computeRiskScore — Criticality contribution', () => {
  it('scales Tier1 > Tier2 > Tier3', () => {
    const t1 = computeRiskScore({ ...MINIMAL_INFO, criticality: Criticality.Tier1 });
    const t2 = computeRiskScore({ ...MINIMAL_INFO, criticality: Criticality.Tier2 });
    const t3 = computeRiskScore({ ...MINIMAL_INFO, criticality: Criticality.Tier3 });
    expect(t1.criticalityContribution).toBe(MAX_CRITICALITY_CONTRIBUTION);
    expect(t2.criticalityContribution).toBeLessThan(t1.criticalityContribution);
    expect(t3.criticalityContribution).toBeLessThan(t2.criticalityContribution);
  });
});

describe('computeRiskScore — DataClassification contribution', () => {
  it('Public contributes zero', () => {
    expect(
      computeRiskScore({ ...MINIMAL_INFO, dataClassification: DataClassification.Public })
        .dataClassificationContribution
    ).toBe(0);
  });

  it('Restricted contributes the maximum', () => {
    expect(
      computeRiskScore({ ...MINIMAL_INFO, dataClassification: DataClassification.Restricted })
        .dataClassificationContribution
    ).toBe(MAX_DATA_CLASSIFICATION_CONTRIBUTION);
  });
});

describe('computeRiskScore — total and breakdown', () => {
  it('total equals the sum of contributions (modulo rounding)', () => {
    const result = computeRiskScore({
      canonicalSeverity: CanonicalSeverity.High,
      cvssBase: 7.5,
      epssPercentile: 0.4,
      kev: true,
      exposure: Exposure.Internet,
      criticality: Criticality.Tier1,
      dataClassification: DataClassification.Confidential,
    });
    const sum =
      result.cvssContribution +
      result.epssContribution +
      result.kevContribution +
      result.exposureContribution +
      result.criticalityContribution +
      result.dataClassificationContribution;
    expect(Math.abs(result.total - sum)).toBeLessThanOrEqual(1);
  });

  it('saturates at 100 with maximum signals across every dimension', () => {
    const result = computeRiskScore({
      canonicalSeverity: CanonicalSeverity.Critical,
      cvssBase: 10,
      epssPercentile: 1,
      kev: true,
      exposure: Exposure.Internet,
      criticality: Criticality.Tier1,
      dataClassification: DataClassification.Restricted,
    });
    expect(result.total).toBe(100);
  });

  it('returns zero across the board for the minimum-signal Info case', () => {
    const result = computeRiskScore({ canonicalSeverity: CanonicalSeverity.Info });
    expect(result.total).toBe(0);
    expect(result.cvssContribution).toBe(0);
    expect(result.epssContribution).toBe(0);
    expect(result.kevContribution).toBe(0);
    expect(result.exposureContribution).toBe(0);
    expect(result.criticalityContribution).toBe(0);
    expect(result.dataClassificationContribution).toBe(0);
  });
});

describe('computeRiskScore — determinism', () => {
  it('returns identical results for identical inputs (including inputsHash)', () => {
    const inputs: RiskScoreInputs = {
      canonicalSeverity: CanonicalSeverity.High,
      cvssBase: 8,
      epssPercentile: 0.42,
      kev: true,
      exposure: Exposure.Internet,
      criticality: Criticality.Tier1,
      dataClassification: DataClassification.Confidential,
    };
    const a = computeRiskScore(inputs);
    const b = computeRiskScore(inputs);
    expect(b).toEqual(a);
  });

  it('hashInputs is stable for the same inputs', () => {
    const inputs: RiskScoreInputs = {
      canonicalSeverity: CanonicalSeverity.Medium,
      epssPercentile: 0.1,
    };
    expect(hashInputs(inputs)).toBe(hashInputs(inputs));
  });

  it('hashInputs differs when any input changes', () => {
    const base: RiskScoreInputs = { canonicalSeverity: CanonicalSeverity.Medium };
    const withKev: RiskScoreInputs = { ...base, kev: true };
    expect(hashInputs(base)).not.toBe(hashInputs(withKev));
  });

  it('hashInputs treats undefined and an absent key identically', () => {
    const a: RiskScoreInputs = {
      canonicalSeverity: CanonicalSeverity.Low,
    };
    const b: RiskScoreInputs = {
      canonicalSeverity: CanonicalSeverity.Low,
      epssPercentile: undefined,
      kev: undefined,
    };
    expect(hashInputs(a)).toBe(hashInputs(b));
  });
});
