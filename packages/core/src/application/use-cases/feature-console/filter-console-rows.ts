/**
 * Roster filter (spec 143).
 *
 * Every whitespace-separated word of the query must appear, ignoring case, in
 * one of the row's name, short id, repository, branch, state, phase or agent.
 * Pure, so a console can filter on every keystroke and any other surface can
 * match the same way.
 */

import { getAgentDescriptor } from '../../../domain/shared/agent-catalog.js';
import type { FeatureConsoleRow } from './feature-console.types.js';

const WORD_SEPARATOR = /\s+/;

function searchableText(row: FeatureConsoleRow): string {
  return [
    row.name,
    row.shortId,
    row.repositoryName,
    row.branch,
    row.state,
    row.phase,
    row.agentType ?? '',
    row.agentType ? (getAgentDescriptor(row.agentType)?.label ?? '') : '',
  ]
    .join('\n')
    .toLowerCase();
}

/** The rows matching every word of `query`, in their original order. */
export function filterConsoleRows<Row extends FeatureConsoleRow>(
  rows: readonly Row[],
  query: string
): Row[] {
  const words = query.trim().toLowerCase().split(WORD_SEPARATOR).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const text = searchableText(row);
    return words.every((word) => text.includes(word));
  });
}
