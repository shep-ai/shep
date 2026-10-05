import { describe, it, expect } from 'vitest';
import {
  MAX_INCIDENT_HYPOTHESES,
  actionLabel,
  draftPostmortem,
  isAutoApproved,
  isUrgentSeverity,
  parseActionProposal,
  rankIncidentHypotheses,
} from '@/domain/shared/incidents.js';
import {
  ActionProposer,
  HypothesisConfidence,
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
  type Incident,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-05T10:00:00Z');
const T2 = new Date('2026-10-05T10:20:00Z');
const T3 = new Date('2026-10-05T11:00:00Z');

describe('incident rules', () => {
  it('runs only the action kinds the space allows', () => {
    const settings = { autoRuntimeActions: [RuntimeActionKind.Restart] };
    expect(isAutoApproved(settings, RuntimeActionKind.Restart)).toBe(true);
    expect(isAutoApproved(settings, RuntimeActionKind.Rollback)).toBe(false);
    expect(isAutoApproved(undefined, RuntimeActionKind.Restart)).toBe(false);
  });

  it('treats critical and major incidents as urgent', () => {
    expect(isUrgentSeverity(IncidentSeverity.Critical)).toBe(true);
    expect(isUrgentSeverity(IncidentSeverity.Major)).toBe(true);
    expect(isUrgentSeverity(IncidentSeverity.Minor)).toBe(false);
  });

  it('labels actions', () => {
    expect(actionLabel(RuntimeActionKind.Restart)).toBe('restart');
    expect(actionLabel(RuntimeActionKind.Scale, 6)).toBe('scale to 6 replicas');
  });

  it('ranks hypotheses by confidence and drops empty ones', () => {
    const ranked = rankIncidentHypotheses([
      { cause: 'Bad config', confidence: 'low', evidence: 'x' },
      { cause: '', confidence: 'high' },
      { cause: 'OOM after deploy', confidence: 'High', evidence: 'OOMKilled ×4' },
      { cause: 'Slow DB', confidence: 'medium' },
      { cause: 'Fourth', confidence: 'low' },
    ]);
    expect(ranked.map((h) => h.cause)).toEqual(['OOM after deploy', 'Slow DB', 'Bad config']);
    expect(ranked[0]).toEqual({
      cause: 'OOM after deploy',
      confidence: HypothesisConfidence.High,
      evidence: 'OOMKilled ×4',
    });
    expect(ranked).toHaveLength(MAX_INCIDENT_HYPOTHESES);
    expect(rankIncidentHypotheses('nonsense')).toEqual([]);
  });

  it('accepts only well-formed action proposals', () => {
    expect(parseActionProposal({ kind: 'Rollback', reason: 'bad deploy' })).toEqual({
      kind: RuntimeActionKind.Rollback,
      reason: 'bad deploy',
    });
    expect(parseActionProposal({ kind: 'Scale', replicas: 4, reason: 'cpu' })).toEqual({
      kind: RuntimeActionKind.Scale,
      replicas: 4,
      reason: 'cpu',
    });
    expect(parseActionProposal({ kind: 'Scale', reason: 'no replicas' })).toBeUndefined();
    expect(
      parseActionProposal({ kind: 'Scale', replicas: 1000, reason: 'too many' })
    ).toBeUndefined();
    expect(parseActionProposal({ kind: 'Delete', reason: 'x' })).toBeUndefined();
    expect(parseActionProposal(null)).toBeUndefined();
  });

  it('drafts a postmortem from the timeline and actions', () => {
    const incident: Incident = {
      id: 'inc-1',
      spaceId: 's',
      title: 'Checkout 5xx',
      severity: IncidentSeverity.Critical,
      status: IncidentStatus.Mitigated,
      source: IncidentSource.Alert,
      runtimeNamespace: 'shop',
      runtimeWorkload: 'checkout',
      mitigatedAt: T2,
      createdAt: T1,
      updatedAt: T2,
    };
    const text = draftPostmortem(
      incident,
      [
        {
          id: 'e1',
          incidentId: 'inc-1',
          kind: IncidentEventKind.Opened,
          text: 'Alert fired',
          createdAt: T1,
        },
        {
          id: 'e2',
          incidentId: 'inc-1',
          kind: IncidentEventKind.Hypothesis,
          text: 'OOM after deploy (High)',
          createdAt: T1,
        },
        {
          id: 'e3',
          incidentId: 'inc-1',
          kind: IncidentEventKind.Recovered,
          text: 'Rollout ready',
          createdAt: T2,
        },
      ],
      [
        {
          id: 'a1',
          incidentId: 'inc-1',
          kind: RuntimeActionKind.Rollback,
          status: RuntimeActionStatus.Succeeded,
          proposedBy: ActionProposer.Agent,
          reason: 'Bad deploy',
          recovered: true,
          createdAt: T1,
          updatedAt: T2,
        },
      ],
      T3
    );
    expect(text).toContain('# Postmortem: Checkout 5xx');
    expect(text).toContain('Critical');
    expect(text).toContain('shop/checkout');
    expect(text).toContain('20 minutes');
    expect(text).toContain('rollback');
    expect(text).toContain('OOM after deploy');
    expect(text).toContain('## Follow-ups');
  });

  it('keeps multi-line evidence inside its timeline entry, and says when recovery was quick', () => {
    const incident: Incident = {
      id: 'inc-1',
      spaceId: 'space-acme',
      title: 'Checkout 5xx',
      severity: IncidentSeverity.Critical,
      status: IncidentStatus.Resolved,
      source: IncidentSource.Manual,
      createdAt: T1,
      updatedAt: T1,
      mitigatedAt: new Date(T1.getTime() + 20_000),
    };
    const text = draftPostmortem(
      incident,
      [
        {
          id: 'e1',
          incidentId: 'inc-1',
          kind: IncidentEventKind.Evidence,
          text: 'Rollout status:\nNAME  READY\ncheckout  1/3\n\nRecent logs:\nERROR boom',
          createdAt: T1,
        },
      ],
      [],
      T2
    );
    expect(text).toContain('less than a minute after opening');
    expect(text).toContain(
      [
        `- ${T1.toISOString()} — Evidence: Rollout status:`,
        '',
        '  ```',
        '  NAME  READY',
        '  checkout  1/3',
        '',
        '  Recent logs:',
        '  ERROR boom',
        '  ```',
      ].join('\n')
    );
  });
});
