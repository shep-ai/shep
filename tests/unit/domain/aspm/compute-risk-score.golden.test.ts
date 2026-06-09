/**
 * Golden-file fixture test for computeRiskScore.
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-27.
 *
 * Asserts byte-stable output across ~14 representative risk-scoring inputs
 * (canonical-severity-only, EPSS-boosted, KEV-listed, internet-exposed
 * tier-1 asset, fully-saturated 100-point cap, etc.). Any change to the
 * weights, the canonical-severity → CVSS mapping, the exposure /
 * criticality / data-classification multipliers, or the `inputsHash`
 * serialization will fail this test loudly — which is intentional. The
 * fixture is the single place to update when scoring is intentionally
 * tuned; CI failures here are a signal, not noise.
 *
 * Fixture location: tests/fixtures/aspm/scoring/golden-cases.json
 *
 * Case selection rationale (one header sentence per case):
 *   - info-only-no-context: floor of the score space; verifies zero across
 *     every dimension.
 *   - low/medium/high/critical-no-context: each canonical severity at its
 *     own row so a band-mapping change is bisectable.
 *   - high-with-cvss-78: explicit CVSS overrides the canonical mapping.
 *   - critical-with-epss-mid: EPSS contributes linearly mid-percentile.
 *   - high-kev-listed: KEV adds the full boost.
 *   - critical-kev-epss-high: stacked CVSS + KEV + EPSS.
 *   - medium-internet-tier1-confidential: asset-context dominates a
 *     moderately-severe technical finding.
 *   - high-airgapped-tier3-public: every asset dimension is at its floor
 *     while the technical severity is high.
 *   - fully-saturated-max-100: every dimension at maximum — verifies the
 *     100-point cap.
 *   - no-cve-secret-finding-high: a SAST/secret finding with no CVE relies
 *     entirely on canonical mapping + asset context.
 *   - low-internal-tier2-internal: a "boring" middle case to catch
 *     accidental floor/ceiling regressions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { computeRiskScore, type RiskScoreInputs } from '@/domain/aspm/scoring/compute-risk-score';

interface GoldenCase {
  name: string;
  inputs: RiskScoreInputs;
  expected: {
    total: number;
    cvssContribution: number;
    epssContribution: number;
    kevContribution: number;
    exposureContribution: number;
    criticalityContribution: number;
    dataClassificationContribution: number;
    inputsHash: string;
  };
}

interface GoldenFile {
  cases: GoldenCase[];
}

const fixturePath = resolve(__dirname, '../../../fixtures/aspm/scoring/golden-cases.json');

const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as GoldenFile;

describe('computeRiskScore — golden fixture', () => {
  it('fixture contains at least 10 cases', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    'case %s produces the expected byte-stable output',
    (_name, golden) => {
      const actual = computeRiskScore(golden.inputs);
      expect(actual).toEqual(golden.expected);
    }
  );

  it('every case name is unique (fixture sanity)', () => {
    const names = fixture.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
