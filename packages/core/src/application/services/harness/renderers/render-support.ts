/**
 * Shared text utilities for chunk renderers (spec 119).
 */
import { tokenizeForRelevance } from '../../../../domain/shared/lexical-relevance.js';

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
export function matchingLineIndexes(all: readonly string[], query: string): number[] {
  const q = tokenizeForRelevance(query);
  if (q.size === 0) return [];
  const out: number[] = [];
  all.forEach((line, i) => {
    for (const token of tokenizeForRelevance(line)) {
      if (q.has(token)) {
        out.push(i);
        return;
      }
    }
  });
  return out;
}

/** Merge ±radius windows around hit lines into line ranges. */
export function windows(
  hits: readonly number[],
  radius: number,
  total: number,
  maxWindows: number
): [number, number][] {
  const ranges: [number, number][] = [];
  for (const h of hits) {
    const from = Math.max(0, h - radius);
    const to = Math.min(total - 1, h + radius);
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
    if (ranges.length > maxWindows) break;
  }
  return ranges.slice(0, maxWindows);
}

/** Render selected line ranges with numbers and gap markers. */
export function renderRanges(all: readonly string[], ranges: readonly [number, number][]): string {
  return ranges.map(([from, to]) => numbered(all.slice(from, to + 1), from + 1)).join('\n   ⋮\n');
}
