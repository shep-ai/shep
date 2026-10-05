/** `shep incident` (spec 129): thin commands over the incident use cases. */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ActionProposer,
  AgentType,
  HypothesisConfidence,
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
} from '@/domain/generated/output.js';

const { open, manage, actions, triage } = vi.hoisted(() => ({
  open: { execute: vi.fn() },
  manage: { list: vi.fn(), get: vi.fn(), note: vi.fn(), resolve: vi.fn() },
  actions: { propose: vi.fn(), approve: vi.fn(), reject: vi.fn() },
  triage: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        OpenIncidentUseCase: open,
        ManageIncidentsUseCase: manage,
        RuntimeActionsUseCase: actions,
        TriageIncidentUseCase: triage,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createIncidentCommand } from '../../../../../../src/presentation/cli/commands/incident/index.js';

const T = new Date('2026-10-05T10:00:00Z');
const INCIDENT = {
  id: 'inc-1',
  spaceId: 's',
  title: 'Checkout 5xx',
  severity: IncidentSeverity.Critical,
  status: IncidentStatus.Open,
  source: IncidentSource.Alert,
  runtimeNamespace: 'shop',
  runtimeWorkload: 'checkout',
  createdAt: T,
  updatedAt: T,
};
const ACTION = {
  id: 'act-1',
  incidentId: 'inc-1',
  kind: RuntimeActionKind.Rollback,
  status: RuntimeActionStatus.Proposed,
  proposedBy: ActionProposer.Agent,
  reason: 'bad deploy',
  createdAt: T,
  updatedAt: T,
};

async function cli(...args: string[]): Promise<string> {
  await createIncidentCommand().parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('opens an incident on a workload', async () => {
    open.execute.mockResolvedValue({ ok: true, incident: INCIDENT, duplicate: false });
    const out = await cli(
      'open',
      'Checkout 5xx',
      '--space',
      'acme',
      '--severity',
      'critical',
      '--workload',
      'checkout',
      '--namespace',
      'shop',
      '--context',
      'prod'
    );
    expect(open.execute).toHaveBeenCalledWith({
      title: 'Checkout 5xx',
      space: 'acme',
      severity: IncidentSeverity.Critical,
      workload: 'checkout',
      namespace: 'shop',
      context: 'prod',
    });
    expect(out).toContain('inc-1');
  });

  it('refuses an unknown severity', async () => {
    const out = await cli('open', 'x', '--severity', 'apocalyptic');
    expect(out).toContain('apocalyptic');
    expect(open.execute).not.toHaveBeenCalled();
  });

  it('lists open incidents and shows one with its timeline and actions', async () => {
    manage.list.mockResolvedValue([INCIDENT]);
    expect(await cli('ls', '--open')).toContain('Checkout 5xx');
    expect(manage.list).toHaveBeenCalledWith({ open: true });

    manage.get.mockResolvedValue({
      ok: true,
      detail: {
        incident: INCIDENT,
        events: [
          {
            id: 'e1',
            incidentId: 'inc-1',
            kind: IncidentEventKind.Hypothesis,
            text: 'OOM (High)',
            createdAt: T,
          },
        ],
        actions: [ACTION],
      },
    });
    const out = await cli('show', 'inc-1');
    expect(out).toContain('OOM (High)');
    expect(out).toContain('act-1');
    expect(out).toContain('rollback');
  });

  it('triages with an agent and prints the hypotheses and the proposal', async () => {
    triage.execute.mockResolvedValue({
      ok: true,
      summary: 'OOM since deploy',
      hypotheses: [
        { cause: 'Memory regression', confidence: HypothesisConfidence.High, evidence: '' },
      ],
      action: ACTION,
    });
    const out = await cli('triage', 'inc-1', '--agent', AgentType.ClaudeCode);
    expect(triage.execute).toHaveBeenCalledWith('inc-1', AgentType.ClaudeCode);
    expect(out).toContain('Memory regression');
    expect(out).toContain('shep incident approve act-1');
  });

  it('acts as a person, approves and rejects', async () => {
    actions.propose.mockResolvedValue({
      ok: true,
      action: {
        ...ACTION,
        kind: RuntimeActionKind.Scale,
        replicas: 6,
        status: RuntimeActionStatus.Succeeded,
        recovered: true,
      },
    });
    await cli('act', 'inc-1', 'scale', '--replicas', '6', '--reason', 'cpu');
    expect(actions.propose).toHaveBeenCalledWith(
      'inc-1',
      { kind: RuntimeActionKind.Scale, replicas: 6, reason: 'cpu' },
      ActionProposer.Person
    );
    actions.approve.mockResolvedValue({
      ok: true,
      action: { ...ACTION, status: RuntimeActionStatus.Succeeded, recovered: false },
    });
    const out = await cli('approve', 'act-1');
    expect(out).toContain('not recovered');
    actions.reject.mockResolvedValue({
      ok: true,
      action: { ...ACTION, status: RuntimeActionStatus.Rejected },
    });
    await cli('reject', 'act-1', '--reason', 'deploy is fine');
    expect(actions.reject).toHaveBeenCalledWith('act-1', 'deploy is fine');
  });

  it('refuses an unknown runtime action without proposing it', async () => {
    const out = await cli('act', 'inc-1', 'delete');
    expect(out).toContain('delete');
    expect(actions.propose).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('notes and resolves, printing the postmortem', async () => {
    manage.note.mockResolvedValue({ ok: true, event: {} });
    await cli('note', 'inc-1', 'Paged the DB team');
    expect(manage.note).toHaveBeenCalledWith('inc-1', 'Paged the DB team');
    manage.resolve.mockResolvedValue({
      ok: true,
      incident: {
        ...INCIDENT,
        status: IncidentStatus.Resolved,
        postmortem: '# Postmortem: Checkout 5xx',
      },
    });
    const out = await cli('resolve', 'inc-1');
    expect(manage.resolve).toHaveBeenCalledWith('inc-1');
    expect(out).toContain('# Postmortem: Checkout 5xx');
  });
});
