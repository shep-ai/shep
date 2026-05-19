/**
 * ClaudeSettingsReconciler — pure-functional merge of two `.claude/settings.json`
 * payloads.
 *
 * Used by the bedrock enable flow to reconcile the pre-`bedrock init` snapshot
 * (the state shep wrote via SkillInjectorService) with the post-`bedrock init`
 * state, so neither party clobbers the other's hook entries.
 *
 * Behaviour:
 *   - Both inputs may be `undefined` / `null` (treated as `{}`).
 *   - Top-level object keys are deep-merged.
 *   - Arrays are unioned and deduped by a stable canonical-JSON signature so
 *     repeat merges are idempotent.
 *   - Scalar conflicts on the same key resolve to the `before` (shep) value.
 *   - Type conflicts on the same key (e.g. array vs object) raise
 *     `ClaudeSettingsMergeFailedError` — we never best-effort rewrite on
 *     malformed input.
 *   - Either input over the 1 MiB safety cap raises
 *     `ClaudeSettingsMergeFailedError`.
 *
 * Pure-functional contract: this service performs zero filesystem or process
 * I/O. Callers parse the JSON, hand it in, and write the result back
 * themselves.
 */

import { injectable } from 'tsyringe';

import { ClaudeSettingsMergeFailedError } from '../../../domain/errors/claude-settings-merge-failed.error.js';
import type { IClaudeSettingsReconciler } from '../../../application/ports/output/services/claude-settings-reconciler.service.js';

/** Safety cap on each input — protects against pathological inputs. */
const MAX_INPUT_BYTES = 1024 * 1024;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAcceptableRoot(value: unknown): value is PlainObject | null | undefined {
  return value === null || value === undefined || isPlainObject(value);
}

function approximateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    throw new ClaudeSettingsMergeFailedError('input is not JSON-serialisable');
  }
}

/**
 * Stable canonical JSON: object keys sorted alphabetically at every depth so
 * two structurally-equal entries always produce the same signature.
 */
function canonicalSignature(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSignature).join(',')}]`;
  }
  const keys = Object.keys(value as PlainObject).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalSignature((value as PlainObject)[k])}`
  );
  return `{${parts.join(',')}}`;
}

function unionBySignature(items: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of items) {
    const sig = canonicalSignature(item);
    if (!seen.has(sig)) {
      seen.add(sig);
      result.push(item);
    }
  }
  return result;
}

function deepMerge(before: PlainObject, after: PlainObject): PlainObject {
  const out: PlainObject = {};
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const hasBefore = key in before;
    const hasAfter = key in after;
    if (hasBefore && !hasAfter) {
      out[key] = before[key];
      continue;
    }
    if (!hasBefore && hasAfter) {
      out[key] = after[key];
      continue;
    }
    const bv = before[key];
    const av = after[key];
    if (Array.isArray(bv) && Array.isArray(av)) {
      out[key] = unionBySignature([...bv, ...av]);
    } else if (isPlainObject(bv) && isPlainObject(av)) {
      out[key] = deepMerge(bv, av);
    } else if (Array.isArray(bv) !== Array.isArray(av) || isPlainObject(bv) !== isPlainObject(av)) {
      throw new ClaudeSettingsMergeFailedError(
        `incompatible types for key '${key}' — cannot merge ${describeKind(bv)} with ${describeKind(av)}`
      );
    } else {
      // Scalar collision — shep (before) wins.
      out[key] = bv;
    }
  }
  return out;
}

function describeKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

@injectable()
export class ClaudeSettingsReconciler implements IClaudeSettingsReconciler {
  mergeSettings(before: unknown, after: unknown): unknown {
    if (!isAcceptableRoot(before)) {
      throw new ClaudeSettingsMergeFailedError(
        `'before' must be a JSON object, got ${describeKind(before)}`
      );
    }
    if (!isAcceptableRoot(after)) {
      throw new ClaudeSettingsMergeFailedError(
        `'after' must be a JSON object, got ${describeKind(after)}`
      );
    }
    if (approximateSize(before) > MAX_INPUT_BYTES) {
      throw new ClaudeSettingsMergeFailedError(
        `'before' exceeds the ${MAX_INPUT_BYTES}-byte safety cap`
      );
    }
    if (approximateSize(after) > MAX_INPUT_BYTES) {
      throw new ClaudeSettingsMergeFailedError(
        `'after' exceeds the ${MAX_INPUT_BYTES}-byte safety cap`
      );
    }
    return deepMerge(before ?? {}, after ?? {});
  }
}
