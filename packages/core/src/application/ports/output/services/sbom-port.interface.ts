/**
 * ISbomPort (Output Port) — feature 098, phase 4.
 *
 * Parses a CycloneDX SBOM (1.5+ in MVP; SPDX lands later behind the same
 * contract) into normalized {@link SbomComponentDraft}s and
 * {@link SbomVulnerabilityDraft}s the ingest-sbom use case can shape into
 * dependency-domain SecurityFinding rows.
 *
 * Adapters MUST:
 *  - Enforce a configurable max-size guard (default 100MB, NFR-14).
 *  - Validate against the source schema (ajv) and reject malformed input.
 *  - Be tolerant of optional fields / vendor extensions — never throw on a
 *    non-fatal omission.
 *
 * Pure-domain side effects (dedup, redaction, ownership resolution,
 * KEV/EPSS enrichment, persistence) live downstream in the use case.
 */

import type { CanonicalSeverity } from '../../../../domain/generated/output.js';

export interface SbomComponentDraft {
  /** CycloneDX `bom-ref` — the local identifier used by `vulnerabilities[].affects[].ref`. */
  bomRef: string;
  /** Component name (e.g. `openssl`). */
  name: string;
  /** Component version (e.g. `3.0.2`). */
  version?: string;
  /** Package URL when emitted (e.g. `pkg:npm/lodash@4.17.21`). */
  purl?: string;
  /** Component type (library, framework, application, ...). */
  type?: string;
  /** License identifiers when present (SPDX ids or names). */
  licenses?: string[];
}

export interface SbomVulnerabilityDraft {
  /** Vulnerability identifier as emitted (typically a CVE id). */
  id: string;
  /** CVE id when the identifier is a CVE; same as id in most CycloneDX docs. */
  cveId?: string;
  /** CWE identifiers as emitted by the BOM (CycloneDX uses bare ids: `79`). */
  cweIds?: string[];
  /** Long-form description. */
  description?: string;
  /** Numeric CVSS-style 0-10 score, when the BOM emits one. */
  cvssScore?: number;
  /** Canonical 5-level severity derived from CVSS score or raw severity string. */
  canonicalSeverity: CanonicalSeverity;
  /** Raw severity string emitted by the BOM (e.g. `high`, `8.8`). */
  rawSeverity: string;
  /** `bom-ref` strings of components affected by this vulnerability. */
  affectedComponentRefs: string[];
  /** Source label emitted with the vulnerability (e.g. `nvd`, `osv`). */
  source?: string;
}

export interface SbomParseInput {
  /** Raw CycloneDX document body (UTF-8 string). */
  document: string;
  /** Maximum allowed document length in bytes (defaults applied if absent). */
  maxBytes?: number;
}

export interface SbomDraft {
  /** Components emitted in the BOM, in document order. */
  components: SbomComponentDraft[];
  /** Vulnerabilities with embedded affected-component references. */
  vulnerabilities: SbomVulnerabilityDraft[];
  /** BOM format identifier as emitted (`CycloneDX`). */
  bomFormat?: string;
  /** Spec version (e.g. `1.5`). */
  specVersion?: string;
  /** Tool that produced the BOM, when reported. */
  toolName?: string;
  /** Source label populated on every emitted finding (e.g. `cyclonedx:1.5`). */
  sourceLabel: string;
}

export interface ISbomPort {
  /** Parse a CycloneDX document. Throws a typed error on size-cap / malformed input. */
  parse(input: SbomParseInput): Promise<SbomDraft>;
}
