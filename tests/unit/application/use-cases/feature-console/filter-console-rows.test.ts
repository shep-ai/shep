/**
 * filterConsoleRows Unit Tests (spec 143)
 *
 * The roster filter: every word typed must match some field of the row, so
 * "billing gate" finds the billing feature waiting at a gate.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { AgentType, FeatureState } from '@/domain/generated/output.js';
import { filterConsoleRows } from '@/application/use-cases/feature-console/filter-console-rows.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';

function row(overrides: Partial<FeatureConsoleRow>): FeatureConsoleRow {
  return {
    featureId: 'id',
    shortId: 'id',
    name: 'Feature',
    repositoryName: 'acme-web',
    repositoryPath: '/work/acme-web',
    branch: 'feat/x',
    state: FeatureState.Running,
    phase: 'implement',
    elapsedMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    pendingQuestions: 0,
    needsAttention: false,
    actions: [],
    updatedAt: new Date(0),
    ...overrides,
  } as FeatureConsoleRow;
}

const rows = [
  row({
    featureId: '1',
    shortId: 'a1b2c3d4',
    name: 'Billing dashboard',
    state: FeatureState.ActionRequired,
    phase: 'plan',
  }),
  row({
    featureId: '2',
    shortId: 'e5f6a7b8',
    name: 'Dark mode',
    repositoryName: 'billing-api',
    agentType: AgentType.CodexCli,
  }),
  row({
    featureId: '3',
    shortId: 'c9d0e1f2',
    name: 'Rate limit',
    branch: 'feat/rate-limit',
    state: FeatureState.Done,
  }),
];

const ids = (query: string) => filterConsoleRows(rows, query).map((r) => r.featureId);

describe('filterConsoleRows', () => {
  it('keeps every row, in order, for an empty or blank query', () => {
    expect(ids('')).toEqual(['1', '2', '3']);
    expect(ids('   ')).toEqual(['1', '2', '3']);
  });

  it('matches name, repository, branch and short id, ignoring case', () => {
    expect(ids('BILLING')).toEqual(['1', '2']);
    expect(ids('rate-limit')).toEqual(['3']);
    expect(ids('e5f6')).toEqual(['2']);
  });

  it('matches state, phase and agent', () => {
    expect(ids('action-required')).toEqual(['1']);
    expect(ids('done')).toEqual(['3']);
    expect(ids('plan')).toEqual(['1']);
    expect(ids('codex')).toEqual(['2']);
    // The label the console shows, not only the id.
    expect(ids('codex cli')).toEqual(['2']);
  });

  it('requires every word to match', () => {
    expect(ids('billing plan')).toEqual(['1']);
    expect(ids('billing nothing')).toEqual([]);
  });
});
