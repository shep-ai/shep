import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDiscoveryUseCase } from '@/application/use-cases/discovery/run-discovery.use-case.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import {
  AgentType,
  DiscoveryRunStatus,
  OpportunitySource,
  OpportunityStatus,
} from '@/domain/generated/output.js';
import { InMemoryKnowledgeDocuments } from '../../../../helpers/knowledge-repositories.mock.js';
import { InMemoryDiscoveryRuns } from '../../../../helpers/discovery-runs.mock.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { feedbackWorld } from '../feedback/feedback.fixtures.js';

describe('RunDiscoveryUseCase', () => {
  let world: ReturnType<typeof feedbackWorld>;
  let runs: InMemoryDiscoveryRuns;
  let documents: InMemoryKnowledgeDocuments;
  let call: ReturnType<typeof vi.fn>;
  let useCase: RunDiscoveryUseCase;
  const ids: string[] = [];

  function make() {
    return new RunDiscoveryUseCase(
      runs,
      world.signals,
      world.opportunities,
      documents,
      world.spaces,
      world.productLines,
      { call } as unknown as IStructuredAgentCaller,
      world.manageOpportunities,
      world.manageSignals
    );
  }

  beforeEach(async () => {
    world = feedbackWorld();
    runs = new InMemoryDiscoveryRuns();
    documents = new InMemoryKnowledgeDocuments();
    ids.length = 0;
    for (const title of ['Checkout times out', 'Guest checkout slow', 'Invoices lack PO']) {
      const recorded = await world.manageSignals.record({ space: 'acme', title });
      if (!recorded.ok) throw new Error(recorded.error);
      ids.push(recorded.signal.id);
    }
    await world.manageOpportunities.create({ space: 'acme', title: 'Dark mode', reviewHours: 2 });
    call = vi.fn(async () => ({
      proposals: [
        {
          title: 'Faster guest checkout',
          problem: 'Guests abandon checkout.',
          outline: 'Cache the session lookup.',
          rationale: 'Two reports this week.',
          signalIds: [ids[0], ids[1]],
          reviewHours: 6,
          confidence: 0.7,
        },
        { title: 'Dark mode', signalIds: [ids[2]] },
        { title: 'Made up', signalIds: ['nope'] },
      ],
    }));
    useCase = make();
  });

  it('creates discovered opportunities from proposals backed by loose signals', async () => {
    const result = await useCase.execute({ space: 'acme' });
    if (!result.ok) throw new Error(result.error);
    expect(result.run).toMatchObject({
      spaceId: ACME.id,
      status: DiscoveryRunStatus.Succeeded,
      signalsRead: 3,
      proposed: 1,
      dropped: 2,
    });
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      title: 'Faster guest checkout',
      status: OpportunityStatus.Proposed,
      source: OpportunitySource.Discovery,
      brief: 'Cache the session lookup.\n\nTwo reports this week.',
    });
    const linked = await world.signals.list({ opportunityId: result.opportunities[0].id });
    expect(linked.map((s) => s.id).sort()).toEqual([ids[0], ids[1]].sort());
  });

  it('shows the agent the evidence and nothing to act with', async () => {
    await useCase.execute({ space: 'acme' });
    const [prompt, schema, options] = call.mock.calls[0];
    expect(prompt).toContain(ids[0]);
    expect(prompt).toContain('Checkout times out');
    expect(prompt).toContain('Dark mode');
    expect(schema).toMatchObject({ type: 'object' });
    expect(options).toMatchObject({ allowedTools: [], disableMcp: true, silent: true });
  });

  it('records a failed run when the agent call fails', async () => {
    call.mockRejectedValueOnce(new Error('agent timed out'));
    const result = await useCase.execute({ space: 'acme' });
    expect(result).toEqual({ ok: false, error: 'agent timed out' });
    const latest = await runs.latest(ACME.id);
    expect(latest).toMatchObject({ status: DiscoveryRunStatus.Failed, error: 'agent timed out' });
  });

  it('refuses a second run while one is running, and nothing to read', async () => {
    let finish: (value: unknown) => void = () => undefined;
    call.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = useCase.execute({ space: 'acme' });
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
    const second = await useCase.execute({ space: 'acme' });
    expect(second.ok).toBe(false);
    finish({ proposals: [] });
    expect((await first).ok).toBe(true);

    expect((await useCase.execute({ space: 'default' })).ok).toBe(false);
  });

  it('applies the space agent rules', async () => {
    ACME.agentSettings = { allowedAgentTypes: [AgentType.CodexCli] };
    try {
      expect((await useCase.execute({ space: 'acme', agentType: AgentType.ClaudeCode })).ok).toBe(
        false
      );
      await useCase.execute({ space: 'acme' });
      expect(call.mock.calls[0][2]).toMatchObject({ agentType: AgentType.CodexCli });
    } finally {
      delete ACME.agentSettings;
    }
  });
});
