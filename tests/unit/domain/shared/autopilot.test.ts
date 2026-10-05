import { describe, it, expect } from 'vitest';
import {
  HypothesisConfidence,
  InvestigationStatus,
  OpportunityStatus,
  Priority,
  StateGroup,
  type AutopilotRun,
  type WorkItemInvestigation,
} from '@/domain/generated/output.js';
import {
  DEFAULT_DAILY_FIX_BUDGET,
  confidentHypothesis,
  defaultAutopilotPolicy,
  fixGates,
  fixesLeft,
  isAutopilotOn,
  isUrgentOpen,
  linesToBuild,
} from '@/domain/shared/autopilot.js';
import type { ScoredOpportunity } from '@/domain/shared/opportunity-score.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function investigation(extra: Partial<WorkItemInvestigation>): WorkItemInvestigation {
  return {
    id: 'inv-1',
    workItemId: 'wi-1',
    repositoryPath: '/repo',
    status: InvestigationStatus.Completed,
    hypotheses: [
      {
        number: 1,
        title: 'Cache',
        rootCause: 'stale cache',
        confidence: HypothesisConfidence.High,
        evidence: [],
        testPlan: 't',
        fixPlan: 'f',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function run(hoursAgo: number, fixed: string[]): AutopilotRun {
  const at = new Date(NOW.getTime() - hoursAgo * HOUR);
  return {
    id: `r${hoursAgo}`,
    spaceId: 's',
    investigated: [],
    fixed,
    built: [],
    errors: [],
    createdAt: at,
    updatedAt: at,
  };
}

describe('autopilot rules (spec 132)', () => {
  it('starts with everything off and a small fix budget', () => {
    const policy = defaultAutopilotPolicy('s', NOW);
    expect(policy).toEqual({
      spaceId: 's',
      investigateUrgent: false,
      fixConfident: false,
      mergeFixes: false,
      fillLine: false,
      dailyFixBudget: DEFAULT_DAILY_FIX_BUDGET,
      updatedAt: NOW,
    });
    expect(isAutopilotOn(policy)).toBe(false);
    expect(isAutopilotOn({ ...policy, fillLine: true })).toBe(true);
  });

  it('treats open Urgent work items as urgent', () => {
    expect(isUrgentOpen({ priority: Priority.Urgent }, StateGroup.Started)).toBe(true);
    expect(isUrgentOpen({ priority: Priority.Urgent }, StateGroup.Completed)).toBe(false);
    expect(isUrgentOpen({ priority: Priority.Urgent }, StateGroup.Cancelled)).toBe(false);
    expect(isUrgentOpen({ priority: Priority.High }, StateGroup.Backlog)).toBe(false);
  });

  it('fixes only a completed, unfixed investigation whose top hypothesis is High', () => {
    expect(confidentHypothesis(investigation({}))).toBe(1);
    expect(confidentHypothesis(investigation({ featureId: 'f' }))).toBeUndefined();
    expect(
      confidentHypothesis(investigation({ status: InvestigationStatus.Running }))
    ).toBeUndefined();
    const medium = investigation({});
    medium.hypotheses[0] = { ...medium.hypotheses[0], confidence: HypothesisConfidence.Medium };
    expect(confidentHypothesis(medium)).toBeUndefined();
  });

  it('counts fixes of the last 24 hours against the budget', () => {
    expect(fixesLeft([run(1, ['A', 'B']), run(30, ['C', 'D'])], 3, NOW)).toBe(1);
    expect(fixesLeft([run(1, ['A', 'B', 'C', 'D'])], 3, NOW)).toBe(0);
  });

  it('approves requirements and plan, and merge only when allowed', () => {
    const policy = defaultAutopilotPolicy('s', NOW);
    expect(fixGates(policy)).toEqual({ allowPrd: true, allowPlan: true, allowMerge: false });
    expect(fixGates({ ...policy, mergeFixes: true }).allowMerge).toBe(true);
  });

  it('builds only accepted opportunities inside the line', () => {
    const scored = (id: string, status: OpportunityStatus) =>
      ({ opportunity: { id, status } }) as ScoredOpportunity;
    expect(
      linesToBuild([
        scored('a', OpportunityStatus.Accepted),
        scored('b', OpportunityStatus.Building),
        scored('c', OpportunityStatus.Proposed),
      ]).map((s) => s.opportunity.id)
    ).toEqual(['a']);
  });
});
