/**
 * Feedback themes (spec 127): unlinked signals grouped by the words they
 * share, so twenty requests for the same thing read as one theme with twenty
 * voices behind it.
 *
 * Two signals belong together when the Jaccard similarity of their terms
 * (title and detail) reaches THEME_SIMILARITY; groups are the connected
 * components of that relation. A theme needs MIN_THEME_SIGNALS signals, is
 * labelled by its most common terms and keyed by its oldest signal.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import type { Signal } from '../generated/output';
import { evidenceOf, type OpportunityEvidence } from './opportunity-score';
import { signalTerms, termSimilarity } from './text-terms';

export const THEME_SIMILARITY = 0.3;
export const MIN_THEME_SIGNALS = 2;
export const THEME_LABEL_TERMS = 3;

export interface FeedbackTheme {
  /** Id of the theme's oldest signal; stable while that signal stays unlinked. */
  key: string;
  /** Its most common terms, most common first. */
  label: string;
  signals: Signal[];
  evidence: OpportunityEvidence;
}

function oldestFirst(a: Signal, b: Signal): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

function label(members: Signal[], termsOf: Map<string, Set<string>>): string {
  const counts = new Map<string, number>();
  for (const signal of members) {
    for (const term of termsOf.get(signal.id) ?? []) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, THEME_LABEL_TERMS)
    .map(([term]) => term)
    .join(' ');
}

/** Themes among `signals`, biggest first (then oldest). */
export function groupIntoThemes(signals: readonly Signal[]): FeedbackTheme[] {
  const ordered = [...signals].sort(oldestFirst);
  const termsOf = new Map(ordered.map((signal) => [signal.id, signalTerms(signal)]));
  const parent = ordered.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (parent[current] !== current) current = parent[current];
    return current;
  };
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = termsOf.get(ordered[i].id) ?? new Set<string>();
      const b = termsOf.get(ordered[j].id) ?? new Set<string>();
      if (termSimilarity(a, b) >= THEME_SIMILARITY) parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, Signal[]>();
  ordered.forEach((signal, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  });
  return [...groups.values()]
    .filter((members) => members.length >= MIN_THEME_SIGNALS)
    .map((members) => ({
      key: members[0].id,
      label: label(members, termsOf),
      signals: members,
      evidence: evidenceOf(members),
    }))
    .sort(
      (a, b) =>
        b.signals.length - a.signals.length ||
        a.signals[0].createdAt.getTime() - b.signals[0].createdAt.getTime()
    );
}
