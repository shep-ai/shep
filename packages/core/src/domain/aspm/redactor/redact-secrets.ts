/**
 * Pure-domain Redactor (feature 098, phase 3, NFR-13).
 *
 * Walks scanner-supplied text and masks every match in {@link SECRET_PATTERNS}
 * with a `[REDACTED:<name>]` placeholder, then SHA-256-hashes the original
 * blob (via an injected hasher — keep this module pure).
 *
 * Why a placeholder rather than fixed `***`?
 *   - Audit signal: a reader can see *which* pattern fired, which is the
 *     fastest path to ruling out false positives.
 *   - The hash plus the pattern name lets us reproduce the exact original
 *     scanner string on demand without persisting the secret.
 *
 * The function is intentionally pure — no `process.env`, no fs, no
 * `Date.now()`, no `crypto` (callers pass `computeRawHash` a hasher).
 */

import { SECRET_PATTERNS } from './secret-patterns';

export interface RedactionResult {
  /** Text with every matched span replaced by `[REDACTED:<pattern>]`. */
  redacted: string;
  /** Names of the patterns that fired at least once (in match order). */
  hits: string[];
}

export function redactSecrets(input: string): RedactionResult {
  if (input.length === 0) return { redacted: '', hits: [] };

  let output = input;
  const hits = new Set<string>();

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex so consecutive calls with the same regex stay safe.
    pattern.regex.lastIndex = 0;
    if (!pattern.regex.test(output)) continue;
    pattern.regex.lastIndex = 0;
    output = output.replace(pattern.regex, `[REDACTED:${pattern.name}]`);
    hits.add(pattern.name);
  }

  return { redacted: output, hits: [...hits] };
}

/**
 * Hasher contract — accepts a UTF-8 string and returns a hex SHA-256
 * digest. Pure-domain code receives this as a parameter so callers can
 * inject `node:crypto` in production and a deterministic fake in tests.
 */
export type HashFn = (input: string) => string;

/**
 * Deterministic SHA-256 hash of the original scanner-supplied blob.
 *
 * Stored on `security_findings.scanner_raw_hash` so the redacted body
 * stays useful for audit ("what did the scanner originally emit?") without
 * persisting the secret itself.
 */
export function computeRawHash(blob: string, hash: HashFn): string {
  return hash(blob);
}
