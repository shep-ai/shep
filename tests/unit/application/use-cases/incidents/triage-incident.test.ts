import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriageIncidentUseCase } from '@/application/use-cases/incidents/triage-incident.use-case.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import {
  AgentType,
  IncidentEventKind,
  RuntimeActionKind,
  RuntimeActionStatus,
} from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { incidentWorld } from './incident.fixtures.js';

describe('TriageIncidentUseCase', () => {
  let world: ReturnType<typeof incidentWorld>;
  let call: ReturnType<typeof vi.fn>;
  let triage: TriageIncidentUseCase;

  async function open(workload?: string) {
    const opened = await world.open.execute({
      space: 'acme',
      title: 'Checkout 5xx',
      detail: 'Error rate 8%',
      ...(workload ? { namespace: 'shop', workload } : {}),
    });
    if (!opened.ok) throw new Error(opened.error);
    return opened.incident.id;
  }

  beforeEach(() => {
    world = incidentWorld();
    call = vi.fn(async () => ({
      summary: 'Pods are OOM-killed since the last deploy.',
      hypotheses: [
        {
          cause: 'Memory limit too low for the new build',
          confidence: 'High',
          evidence: 'OOMKilled',
        },
        { cause: 'Traffic spike', confidence: 'Low', evidence: '' },
      ],
      action: { kind: 'Rollback', reason: 'The deploy raised memory use' },
    }));
    triage = new TriageIncidentUseCase(
      world.incidents,
      world.events,
      world.spaces,
      world.runtime,
      { call } as unknown as IStructuredAgentCaller,
      world.runtimeActions
    );
  });

  it('records evidence, the summary, ranked hypotheses and a proposed action', async () => {
    const id = await open('checkout');
    const result = await triage.execute(id);
    if (!result.ok) throw new Error(result.error);
    expect(result.hypotheses.map((h) => h.cause)).toEqual([
      'Memory limit too low for the new build',
      'Traffic spike',
    ]);
    expect(result.action).toMatchObject({
      kind: RuntimeActionKind.Rollback,
      status: RuntimeActionStatus.Proposed,
    });
    expect(world.events.rows.map((e) => e.kind)).toEqual([
      IncidentEventKind.Opened,
      IncidentEventKind.Evidence,
      IncidentEventKind.Note,
      IncidentEventKind.Hypothesis,
      IncidentEventKind.Hypothesis,
      IncidentEventKind.ActionProposed,
    ]);
    const recorded = world.events.rows.find((e) => e.kind === IncidentEventKind.Evidence);
    expect(recorded?.text).toContain('Recent logs');
    expect(recorded?.text).toContain('java.lang.OutOfMemoryError');
    const [prompt, , options] = call.mock.calls[0];
    expect(prompt).toContain('java.lang.OutOfMemoryError');
    expect(prompt).toContain('Error rate 8%');
    expect(options).toMatchObject({ allowedTools: [], disableMcp: true });
  });

  it('triages an incident without a workload from its description alone', async () => {
    const id = await open();
    const result = await triage.execute(id);
    expect(result.ok && result.action).toBeUndefined();
    expect(world.runtime.evidence).not.toHaveBeenCalled();
    expect(world.events.rows.map((e) => e.kind)).not.toContain(IncidentEventKind.ActionProposed);
  });

  it('leaves a note when the agent fails', async () => {
    const id = await open('checkout');
    call.mockRejectedValueOnce(new Error('agent timed out'));
    const result = await triage.execute(id);
    expect(result).toEqual({ ok: false, error: 'agent timed out' });
    expect(world.events.rows.at(-1)).toMatchObject({
      kind: IncidentEventKind.Note,
      text: 'Triage failed: agent timed out',
    });
  });

  it('ignores an action shep cannot run and applies the space agent rules', async () => {
    const id = await open('checkout');
    call.mockResolvedValueOnce({
      summary: 's',
      hypotheses: [],
      action: { kind: 'None', reason: '' },
    });
    const result = await triage.execute(id);
    expect(result.ok && result.action).toBeUndefined();

    ACME.agentSettings = { allowedAgentTypes: [AgentType.CodexCli] };
    try {
      expect((await triage.execute(id, AgentType.ClaudeCode)).ok).toBe(false);
      await triage.execute(id);
      expect(call.mock.calls.at(-1)?.[2]).toMatchObject({ agentType: AgentType.CodexCli });
    } finally {
      delete ACME.agentSettings;
    }
  });
});
