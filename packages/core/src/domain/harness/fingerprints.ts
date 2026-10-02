/**
 * Hashing, fingerprints and token estimates for the harness (spec 119).
 */
import { createHash } from 'node:crypto';

// No .js extension: the web package consumes this subtree as raw TypeScript.
import type { HarnessTaskType } from '../generated/output';

/** Rough token estimate: ceil(chars / 4). Provider usage stays authoritative. */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Lowercase, collapse whitespace, trim. */
export function normalizeGoal(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** JSON with object keys sorted at every level, so equal values hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

export interface QueryFingerprintInput {
  query: string;
  goal: string;
  repoSnapshotId?: string;
  rendererVersions: readonly string[];
  instructionIds: readonly string[];
}

/** Identity under which rendered views may be reused (docs/04 "Query fingerprint"). */
export function queryFingerprint(input: QueryFingerprintInput): string {
  return sha256Hex(
    canonicalJson({
      q: normalizeGoal(input.query),
      g: normalizeGoal(input.goal),
      s: input.repoSnapshotId ?? null,
      r: [...input.rendererVersions].sort(),
      i: [...input.instructionIds].sort(),
    })
  );
}

export interface DedupeKeyInput {
  goal: string;
  scope: readonly string[];
  repoSnapshotId?: string;
  type: HarnessTaskType;
}

/** Stable key for joining or reusing equivalent work (docs/08). */
export function dedupeKey(input: DedupeKeyInput): string {
  return sha256Hex(
    canonicalJson({
      g: normalizeGoal(input.goal),
      sc: [...input.scope].sort(),
      s: input.repoSnapshotId ?? null,
      t: input.type,
    })
  );
}
