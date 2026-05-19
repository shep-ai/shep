/**
 * IFindingIngestPort (Output Port) — feature 098, phase 3.
 *
 * Parses a scanner-supplied document (SARIF v2.1.0 in MVP; SPDX,
 * Snyk-native, Dependabot, GHAS land later behind the same contract) into
 * normalized {@link FindingDraft}s the ingest-findings use case can dedupe,
 * redact, and persist.
 *
 * Adapters MUST:
 *  - Enforce a configurable max-size guard (default 100MB, NFR-14).
 *  - Validate against the source schema (ajv) and reject malformed input
 *    via {@link IngestionTooLargeError} or a typed parse error.
 *  - Be tolerant of unknown extensions / optional fields — never throw on
 *    a non-fatal omission.
 *
 * Pure-domain side effects live downstream in the use case (dedup,
 * redaction, ownership resolution, persistence).
 */

import type { CanonicalSeverity, FindingDomain } from '../../../../domain/generated/output.js';

export interface FindingDraft {
  /** Scanner rule identifier (e.g. semgrep.rule.id, codeql.query.id). */
  ruleId: string;
  /** Short human-readable title. */
  title: string;
  /** Long-form description as emitted by the scanner. */
  description: string;
  /** Finding domain inferred from the rule taxonomy / scanner kind. */
  findingDomain: FindingDomain;
  /** Repo-relative path of the finding location, POSIX-normalized. */
  locationPath?: string;
  /** 1-based line number, when the scanner emits one. */
  locationLine?: number;
  /** Raw severity string as emitted by the scanner. */
  rawSeverity: string;
  /** Canonical 5-level severity. */
  canonicalSeverity: CanonicalSeverity;
  /** CVE identifier, when applicable. */
  cveId?: string;
  /** CWE identifier, when the scanner emits one (e.g. CWE-79). */
  cweId?: string;
  /** OWASP ASVS control id, when present in SARIF taxa references. */
  owaspAsvsControlId?: string;
  /** Free-form raw scanner output (typically a JSON-serialized result). */
  scannerRaw?: string;
  /** Source label, e.g. `sarif:semgrep` or `sarif:codeql`. */
  source: string;
}

export interface IngestParseInput {
  /** Raw document body (UTF-8 string). */
  document: string;
  /** Maximum allowed document length in bytes (defaults applied if absent). */
  maxBytes?: number;
}

export interface IngestParseResult {
  /** Parsed finding drafts in scanner-emitted order. */
  drafts: FindingDraft[];
  /** Source label populated on every draft (e.g. `sarif:semgrep`). */
  sourceLabel: string;
  /** Tool name reported in the scanner document, when present. */
  toolName?: string;
}

export interface IFindingIngestPort {
  /** Parse the document; throw a typed error on size-cap / malformed input. */
  parse(input: IngestParseInput): Promise<IngestParseResult>;
}
