/**
 * computeRiskScore — pure-domain composite risk-score function.
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-26. Transparent
 * composite score (research decision 2) over six dimensions:
 *
 *   total = cvss + epss + kev + exposure + criticality + dataClassification
 *
 * Each dimension contributes up to a documented maximum (see `weights.ts`)
 * scaled by a signal in [0, 1]. The function:
 *
 *   - is PURE — no infra imports, no `Date.now()`, no env access.
 *   - is DETERMINISTIC — identical inputs always produce identical outputs,
 *     including the `inputsHash` returned in the result (covered by the
 *     golden-file fixture test, task-27).
 *   - degrades gracefully — missing EPSS / KEV / asset context drop the
 *     corresponding contribution to zero rather than failing the call.
 *
 * The caller (the `compute-risk-score-for-finding` use case in task-28)
 * appends the result to the `risk_scores` table; this module is fully
 * agnostic of persistence and time.
 */

import type {
  CanonicalSeverity,
  Criticality,
  DataClassification,
  Exposure,
} from '../../generated/output';
import { resolveCvssBase } from './severity-mapping';
import {
  CRITICALITY_MULTIPLIER,
  CVSS_MAX,
  DATA_CLASSIFICATION_MULTIPLIER,
  EXPOSURE_MULTIPLIER,
  MAX_CRITICALITY_CONTRIBUTION,
  MAX_CVSS_CONTRIBUTION,
  MAX_DATA_CLASSIFICATION_CONTRIBUTION,
  MAX_EPSS_CONTRIBUTION,
  MAX_EXPOSURE_CONTRIBUTION,
  MAX_KEV_CONTRIBUTION,
} from './weights';

export interface RiskScoreInputs {
  /** Canonical severity of the finding (always present). */
  canonicalSeverity: CanonicalSeverity;
  /** Optional concrete CVSS base score (0..10). Falls back to canonical mapping. */
  cvssBase?: number;
  /** EPSS percentile (0..1). Undefined when EPSS lookup is unavailable. */
  epssPercentile?: number;
  /** True when the CVE is on the CISA KEV catalog. */
  kev?: boolean;
  /** Exposure of the owning asset; undefined when unknown. */
  exposure?: Exposure;
  /** Business criticality tier of the owning asset. */
  criticality?: Criticality;
  /** Data classification of the owning asset. */
  dataClassification?: DataClassification;
}

export interface RiskScoreContribution {
  total: number;
  cvssContribution: number;
  epssContribution: number;
  kevContribution: number;
  exposureContribution: number;
  criticalityContribution: number;
  dataClassificationContribution: number;
  inputsHash: string;
}

export function computeRiskScore(inputs: RiskScoreInputs): RiskScoreContribution {
  const cvssBase = resolveCvssBase(inputs.cvssBase, inputs.canonicalSeverity);
  const cvssContribution = roundTo2((cvssBase / CVSS_MAX) * MAX_CVSS_CONTRIBUTION);

  const epssPercentile = clamp01(inputs.epssPercentile);
  const epssContribution = roundTo2(epssPercentile * MAX_EPSS_CONTRIBUTION);

  const kevContribution = inputs.kev === true ? MAX_KEV_CONTRIBUTION : 0;

  const exposureContribution =
    inputs.exposure === undefined
      ? 0
      : roundTo2(EXPOSURE_MULTIPLIER[inputs.exposure] * MAX_EXPOSURE_CONTRIBUTION);

  const criticalityContribution =
    inputs.criticality === undefined
      ? 0
      : roundTo2(CRITICALITY_MULTIPLIER[inputs.criticality] * MAX_CRITICALITY_CONTRIBUTION);

  const dataClassificationContribution =
    inputs.dataClassification === undefined
      ? 0
      : roundTo2(
          DATA_CLASSIFICATION_MULTIPLIER[inputs.dataClassification] *
            MAX_DATA_CLASSIFICATION_CONTRIBUTION
        );

  const rawTotal =
    cvssContribution +
    epssContribution +
    kevContribution +
    exposureContribution +
    criticalityContribution +
    dataClassificationContribution;

  const total = clamp(Math.round(rawTotal), 0, 100);

  return {
    total,
    cvssContribution,
    epssContribution,
    kevContribution,
    exposureContribution,
    criticalityContribution,
    dataClassificationContribution,
    inputsHash: hashInputs(inputs),
  };
}

function clamp01(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Stable deterministic hash of the scoring inputs. Non-cryptographic FNV-1a
 * over a canonical key-sorted string serialization. Used to dedupe identical
 * recomputes (per the RiskScore.inputsHash TSP doc) — NOT a security
 * primitive.
 */
export function hashInputs(inputs: RiskScoreInputs): string {
  const canonical = serializeForHash(inputs);
  return fnv1aHex(canonical);
}

function serializeForHash(inputs: RiskScoreInputs): string {
  // Sorted keys + explicit `null` for undefined keeps the hash stable across
  // shapes that differ only by which optional fields are present.
  const parts: [string, string][] = [
    ['canonicalSeverity', String(inputs.canonicalSeverity)],
    ['cvssBase', inputs.cvssBase === undefined ? 'null' : String(inputs.cvssBase)],
    [
      'epssPercentile',
      inputs.epssPercentile === undefined ? 'null' : String(inputs.epssPercentile),
    ],
    ['kev', inputs.kev === undefined ? 'null' : String(inputs.kev)],
    ['exposure', inputs.exposure === undefined ? 'null' : String(inputs.exposure)],
    ['criticality', inputs.criticality === undefined ? 'null' : String(inputs.criticality)],
    [
      'dataClassification',
      inputs.dataClassification === undefined ? 'null' : String(inputs.dataClassification),
    ],
  ];
  parts.sort((a, b) => a[0].localeCompare(b[0]));
  return parts.map(([k, v]) => `${k}=${v}`).join('|');
}

function fnv1aHex(input: string): string {
  // 32-bit FNV-1a — stable, dependency-free, sufficient for dedupe IDs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by 16777619 modulo 2^32. Implemented via shifts/adds to stay
    // within 32-bit unsigned range without BigInt.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
