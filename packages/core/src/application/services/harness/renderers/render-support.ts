/**
 * Shared text utilities for chunk renderers (spec 119).
 */
import { intentTokens } from '../../../../domain/shared/lexical-relevance.js';

export interface RenderedView {
  content: string;
  truncated: boolean;
}

export function lines(text: string): string[] {
  const all = text.split('\n');
  if (all.length > 1 && all[all.length - 1] === '') all.pop();
  return all;
}

/** First `n` lines, with an explicit marker when lines were left out. */
export function head(text: string, n: number): RenderedView {
  const all = lines(text);
  if (all.length <= n) return { content: all.join('\n'), truncated: false };
  return {
    content: `${all.slice(0, n).join('\n')}\n… (${all.length - n} more lines)`,
    truncated: true,
  };
}

/** Last `n` lines, with an explicit marker when lines were left out. */
export function tail(text: string, n: number): RenderedView {
  const all = lines(text);
  if (all.length <= n) return { content: all.join('\n'), truncated: false };
  return {
    content: `… (${all.length - n} earlier lines)\n${all.slice(-n).join('\n')}`,
    truncated: true,
  };
}

/** Prefix lines with 1-based line numbers, as the model sees file views. */
export function numbered(all: readonly string[], startLine = 1): string {
  const width = String(startLine + all.length - 1).length;
  return all.map((l, i) => `${String(startLine + i).padStart(width)}│${l}`).join('\n');
}

/** Line indexes whose text shares a token with the query. */
/** Lines a query token appears on more often than this share are not distinctive. */
const COMMON_TOKEN_SHARE = 0.2;
/** Upper bound on lines a set of windows may cover (dense matches stay bounded). */
export const MAX_WINDOW_LINES = 160;

/**
 * Lines matching the query, most relevant first: each matched query token
 * weighs by how rare it is in the text, so a token on every line of a log
 * (`step`, `INFO`) cannot outrank the one line that names the error.
 */
export function matchingLineIndexes(all: readonly string[], query: string): number[] {
  const q = intentTokens(query);
  if (q.size === 0) return [];
  const perLine = all.map((line) => {
    const hits = new Set<string>();
    for (const t of intentTokens(line)) if (q.has(t)) hits.add(t);
    return hits;
  });
  const frequency = new Map<string, number>();
  for (const hits of perLine) for (const t of hits) frequency.set(t, (frequency.get(t) ?? 0) + 1);
  const commonAt = Math.max(1, all.length * COMMON_TOKEN_SHARE);
  const scored: { i: number; score: number }[] = [];
  perLine.forEach((hits, i) => {
    let score = 0;
    for (const t of hits) {
      const f = frequency.get(t) ?? 1;
      score += f > commonAt ? 0.01 : 1 / f;
    }
    if (score > 0) scored.push({ i, score });
  });
  return scored.sort((x, y) => y.score - x.score || x.i - y.i).map((x) => x.i);
}

/**
 * ±radius windows around hit lines, taken in hit order (most relevant first)
 * until `maxWindows` windows or `maxLines` lines, then merged and sorted.
 */
export function windows(
  hits: readonly number[],
  radius: number,
  total: number,
  maxWindows: number,
  maxLines = MAX_WINDOW_LINES
): [number, number][] {
  const picked: [number, number][] = [];
  let lines = 0;
  for (const h of hits) {
    if (picked.length >= maxWindows) break;
    const from = Math.max(0, h - radius);
    const to = Math.min(total - 1, h + radius);
    if (picked.some(([f, t]) => h >= f && h <= t)) continue;
    if (lines + (to - from + 1) > maxLines && picked.length > 0) break;
    picked.push([from, to]);
    lines += to - from + 1;
  }
  picked.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of picked) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** Render selected line ranges with numbers and gap markers. */
export function renderRanges(all: readonly string[], ranges: readonly [number, number][]): string {
  return ranges.map(([from, to]) => numbered(all.slice(from, to + 1), from + 1)).join('\n   ⋮\n');
}
