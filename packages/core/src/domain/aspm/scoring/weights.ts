/**
 * Risk Score Weights
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-26. Documented
 * weights for the transparent composite risk score. Every weight is a named
 * constant so the breakdown remains explainable and the scoring function
 * has no magic numbers (.claude/rules/code-quality.md — No Magic Values).
 *
 * The composite total is computed in points (0-100). The MAX_*_CONTRIBUTION
 * constants below add up to 100 — they are the upper bound each dimension
 * can contribute when its signal saturates. The actual contribution scales
 * linearly with the input (see `compute-risk-score.ts`).
 *
 * Sum of MAX_* contributions:
 *   CVSS(35) + EPSS(15) + KEV(20) + Exposure(15) + Criticality(10) + Data(5)
 *   = 100
 *
 * Rationale for the chosen distribution:
 *
 *  - CVSS (35) is the heaviest dimension — it carries the technical severity
 *    of the vulnerability as agreed by the industry-standard scoring system
 *    (CVSS v3.1). Findings without a CVE / CVSS still get partial weight via
 *    their canonical severity mapping (`severity-mapping.ts`).
 *  - KEV (20) — CISA's KEV catalog is the strongest single signal that a
 *    vulnerability is being actively exploited in the wild. Membership flips
 *    a full boost on top of CVSS.
 *  - EPSS (15) — Probabilistic exploitability percentile from FIRST. Scales
 *    linearly with the percentile (0..1).
 *  - Exposure (15) — Internet-exposed assets demand attention faster than
 *    air-gapped or internal-only ones.
 *  - Criticality (10) — Tier-1 business-critical applications need to clear
 *    their backlog faster.
 *  - Data Classification (5) — Restricted data raises the stakes of any
 *    exploit; smallest dimension because it modulates rather than drives.
 */

import {
  CanonicalSeverity,
  Criticality,
  DataClassification,
  Exposure,
} from '../../generated/output';

/** Maximum contribution each dimension can add to the total. Sums to 100. */
export const MAX_CVSS_CONTRIBUTION = 35;
export const MAX_EPSS_CONTRIBUTION = 15;
export const MAX_KEV_CONTRIBUTION = 20;
export const MAX_EXPOSURE_CONTRIBUTION = 15;
export const MAX_CRITICALITY_CONTRIBUTION = 10;
export const MAX_DATA_CLASSIFICATION_CONTRIBUTION = 5;

/**
 * Canonical severity → CVSS-equivalent base score in [0, 10].
 * Aligns with CVSS v3.1 severity bands:
 *   Critical = 9.0-10.0  → represented as 10
 *   High     = 7.0-8.9   → 8
 *   Medium   = 4.0-6.9   → 5.5
 *   Low      = 0.1-3.9   → 2
 *   Info     = 0.0       → 0
 *
 * Used when a finding has no concrete CVSS — the canonical severity (which
 * every finding has) becomes the proxy.
 */
export const CANONICAL_SEVERITY_TO_CVSS: Readonly<Record<CanonicalSeverity, number>> = {
  [CanonicalSeverity.Critical]: 10,
  [CanonicalSeverity.High]: 8,
  [CanonicalSeverity.Medium]: 5.5,
  [CanonicalSeverity.Low]: 2,
  [CanonicalSeverity.Info]: 0,
};

/**
 * Asset exposure → multiplier in [0, 1] applied to MAX_EXPOSURE_CONTRIBUTION.
 * Internet > Internal > Airgapped. Unknown is treated as Internal so it
 * never under-scores compared to known-internal assets.
 */
export const EXPOSURE_MULTIPLIER: Readonly<Record<Exposure, number>> = {
  [Exposure.Internet]: 1.0,
  [Exposure.Internal]: 0.5,
  [Exposure.Unknown]: 0.5,
  [Exposure.Airgapped]: 0.1,
};

/**
 * Asset criticality → multiplier in [0, 1].
 * Tier1 is the highest business criticality.
 */
export const CRITICALITY_MULTIPLIER: Readonly<Record<Criticality, number>> = {
  [Criticality.Tier1]: 1.0,
  [Criticality.Tier2]: 0.6,
  [Criticality.Tier3]: 0.3,
};

/**
 * Data classification → multiplier in [0, 1].
 */
export const DATA_CLASSIFICATION_MULTIPLIER: Readonly<Record<DataClassification, number>> = {
  [DataClassification.Restricted]: 1.0,
  [DataClassification.Confidential]: 0.7,
  [DataClassification.Internal]: 0.3,
  [DataClassification.Public]: 0.0,
};

/** Maximum CVSS base score (CVSS v3.1 caps at 10.0). */
export const CVSS_MAX = 10;

/** Sanity check at module load — fails fast if weights drift out of 100. */
const TOTAL_MAX_CONTRIBUTION =
  MAX_CVSS_CONTRIBUTION +
  MAX_EPSS_CONTRIBUTION +
  MAX_KEV_CONTRIBUTION +
  MAX_EXPOSURE_CONTRIBUTION +
  MAX_CRITICALITY_CONTRIBUTION +
  MAX_DATA_CLASSIFICATION_CONTRIBUTION;

if (TOTAL_MAX_CONTRIBUTION !== 100) {
  throw new Error(
    `RiskScore weights misconfigured: MAX_*_CONTRIBUTION sum is ${TOTAL_MAX_CONTRIBUTION}, expected 100`
  );
}
