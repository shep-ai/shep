import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InvestigateWorkItemUseCase } from '@/application/use-cases/bug-loop/investigate-work-item.use-case.js';
import {
  INVESTIGATION_MAX_TURNS,
  INVESTIGATION_TOOLS,
} from '@/application/use-cases/bug-loop/investigation-prompt.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import type {
  IInvestigationWorkspace,
  InvestigationCheckout,
} from '@/application/ports/output/services/investigation-workspace.interface.js';
import { AgentType, HypothesisConfidence, InvestigationStatus } from '@/domain/generated/output.js';
import {
  INVESTIGATION_STALE_AFTER_MS,
  INVESTIGATION_TIMEOUT_MS,
  type RawInvestigationResult,
} from '@/domain/shared/investigation.js';
import { InMemoryInvestigations } from '../../../../helpers/investigation-repository.mock.js';
import {
  SPACE_ENVIRONMENT,
  T0,
  WORK_ITEM,
  fakeApplications,
  fakeGetWorkItem,
  fakeProjects,
  fakeSettings,
  fakeSpaceEnvironment,
  investigation,
} from './bug-loop.fixtures.js';

const CHECKOUT: InvestigationCheckout = { path: '/shep/inv/abc', commitSha: 'c0ffee' };

const RESULT: RawInvestigationResult = {
  summary: 'Guest orders have no customer id.',
  hypotheses: [
    {
      title: 'Low one',
      rootCause: 'Maybe the cache',
      confidence: 'Low',
      evidence: [],
      testPlan: 't',
      fixPlan: 'f',
    },
    {
      title: 'Guest customer id is null',
      rootCause: 'refund() reads order.customer.id',
      confidence: 'High',
      evidence: [{ file: '/shep/inv/abc/src/refund.ts', line: 18, note: 'reads customer.id' }],
      testPlan: 'Refund a guest order',
      fixPlan: 'Fall back to the order email',
    },
  ],
};

function fakeWorkspace(): IInvestigationWorkspace & {
  prepare: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return { prepare: vi.fn(async () => CHECKOUT), dispose: vi.fn(async () => undefined) };
}

describe('InvestigateWorkItemUseCase', () => {
  let repo: InMemoryInvestigations;
  let workspace: ReturnType<typeof fakeWorkspace>;
  let caller: IStructuredAgentCaller & { call: ReturnType<typeof vi.fn> };

  function useCase(
    over: {
      applicationRepositoryPath?: string;
      refusal?: string;
      applicationId?: string;
    } = {}
  ) {
    return new InvestigateWorkItemUseCase(
      repo,
      fakeGetWorkItem(),
      fakeProjects(over.applicationId),
      fakeApplications(over.applicationRepositoryPath),
      workspace,
      caller,
      fakeSettings(AgentType.ClaudeCode),
      fakeSpaceEnvironment(over.refusal)
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    repo = new InMemoryInvestigations();
    workspace = fakeWorkspace();
    caller = { call: vi.fn(async () => RESULT) } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start', () => {
    it('records a pending investigation for the given repository and default agent', async () => {
      const result = await useCase().start({ workItem: 'PAY-42', repositoryPath: '/src/pay' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workItem.id).toBe(WORK_ITEM.id);
      expect(result.investigation).toMatchObject({
        workItemId: WORK_ITEM.id,
        repositoryPath: '/src/pay',
        status: InvestigationStatus.Pending,
        hypotheses: [],
        agentType: AgentType.ClaudeCode,
      });
      expect(await repo.findById(result.investigation.id)).toEqual(result.investigation);
    });

    it('uses the agent asked for', async () => {
      const result = await useCase().start({
        workItem: 'PAY-42',
        repositoryPath: '/src/pay',
        agentType: AgentType.CodexCli,
      });
      expect(result.ok && result.investigation.agentType).toBe(AgentType.CodexCli);
    });

    it('falls back to the previous investigation repository, then the project application', async () => {
      await repo.create(
        investigation({
          id: 'old',
          repositoryPath: '/src/previous',
          status: InvestigationStatus.Failed,
        })
      );
      const fromPrevious = await useCase({
        applicationId: 'app',
        applicationRepositoryPath: '/src/app',
      }).start({
        workItem: 'PAY-42',
      });
      expect(fromPrevious.ok && fromPrevious.investigation.repositoryPath).toBe('/src/previous');

      repo.rows.clear();
      const fromApplication = await useCase({
        applicationId: 'app',
        applicationRepositoryPath: '/src/app',
      }).start({ workItem: 'PAY-42' });
      expect(fromApplication.ok && fromApplication.investigation.repositoryPath).toBe('/src/app');
    });

    it('asks for a repository when none is known', async () => {
      const result = await useCase().start({ workItem: 'PAY-42' });
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/repository.*PAY-42/i) });
      expect(repo.rows.size).toBe(0);
    });

    it('refuses an unknown work item', async () => {
      expect(await useCase().start({ workItem: 'PAY-9', repositoryPath: '/r' })).toEqual({
        ok: false,
        error: 'Work item not found: "PAY-9"',
      });
    });

    it('refuses while another investigation of the item is active', async () => {
      await repo.create(investigation({ status: InvestigationStatus.Running }));
      const result = await useCase().start({ workItem: 'PAY-42', repositoryPath: '/r' });
      expect(result).toEqual({
        ok: false,
        error: expect.stringMatching(/already being investigated/),
      });
    });

    it('fails an abandoned investigation and starts a new one', async () => {
      await repo.create(investigation({ status: InvestigationStatus.Running }));
      vi.setSystemTime(new Date(T0.getTime() + INVESTIGATION_STALE_AFTER_MS + 1));
      const result = await useCase().start({ workItem: 'PAY-42', repositoryPath: '/r' });
      expect(result.ok).toBe(true);
      expect((await repo.findById('inv-1'))?.status).toBe(InvestigationStatus.Failed);
    });

    it('refuses an agent the space does not allow, recording nothing', async () => {
      const result = await useCase({
        refusal: 'The Work space allows only codex-cli agents',
      }).start({ workItem: 'PAY-42', repositoryPath: '/r' });
      expect(result).toEqual({ ok: false, error: 'The Work space allows only codex-cli agents' });
      expect(repo.rows.size).toBe(0);
    });
  });

  describe('run', () => {
    async function started() {
      const result = await useCase().start({ workItem: 'PAY-42', repositoryPath: '/src/pay' });
      if (!result.ok) throw new Error(result.error);
      return result.investigation;
    }

    it('reads a throwaway checkout with read-only tools and the space environment', async () => {
      const pending = await started();
      const done = await useCase().run(pending.id);

      expect(workspace.prepare).toHaveBeenCalledWith('/src/pay', pending.id);
      const [prompt, schema, options] = caller.call.mock.calls[0];
      expect(prompt).toContain('PAY-42');
      expect(prompt).toContain(WORK_ITEM.title);
      expect(schema).toMatchObject({ type: 'object', required: ['summary', 'hypotheses'] });
      expect(options).toEqual({
        cwd: CHECKOUT.path,
        tools: INVESTIGATION_TOOLS,
        maxTurns: INVESTIGATION_MAX_TURNS,
        disableMcp: true,
        silent: true,
        timeout: INVESTIGATION_TIMEOUT_MS,
        agentType: AgentType.ClaudeCode,
        environment: SPACE_ENVIRONMENT,
      });
      expect(workspace.dispose).toHaveBeenCalledWith('/src/pay', CHECKOUT);

      expect(done).toMatchObject({
        status: InvestigationStatus.Completed,
        commitSha: 'c0ffee',
        summary: RESULT.summary,
        startedAt: T0,
        finishedAt: T0,
      });
      expect(done.hypotheses.map((h) => [h.number, h.title, h.confidence])).toEqual([
        [1, 'Guest customer id is null', HypothesisConfidence.High],
        [2, 'Low one', HypothesisConfidence.Low],
      ]);
      expect(done.hypotheses[0].evidence).toEqual([
        { file: 'src/refund.ts', line: 18, note: 'reads customer.id' },
      ]);
      expect(await repo.findById(pending.id)).toEqual(done);
    });

    it('marks the investigation running while the agent reads', async () => {
      const pending = await started();
      let during: unknown;
      caller.call.mockImplementation(async () => {
        during = (await repo.findById(pending.id))?.status;
        return RESULT;
      });
      await useCase().run(pending.id);
      expect(during).toBe(InvestigationStatus.Running);
    });

    it('records an agent failure and still removes the checkout', async () => {
      const pending = await started();
      caller.call.mockRejectedValue(new Error('agent timed out'));
      const done = await useCase().run(pending.id);
      expect(done).toMatchObject({
        status: InvestigationStatus.Failed,
        error: 'agent timed out',
        finishedAt: T0,
      });
      expect(workspace.dispose).toHaveBeenCalledWith('/src/pay', CHECKOUT);
    });

    it('records a workspace failure without calling the agent', async () => {
      const pending = await started();
      workspace.prepare.mockRejectedValue(new Error('/src/pay is not a git repository.'));
      const done = await useCase().run(pending.id);
      expect(done).toMatchObject({
        status: InvestigationStatus.Failed,
        error: '/src/pay is not a git repository.',
      });
      expect(caller.call).not.toHaveBeenCalled();
      expect(workspace.dispose).not.toHaveBeenCalled();
    });

    it('fails when the agent finds no hypothesis, keeping its summary', async () => {
      const pending = await started();
      caller.call.mockResolvedValue({ summary: 'This repository has no refunds.', hypotheses: [] });
      const done = await useCase().run(pending.id);
      expect(done).toMatchObject({
        status: InvestigationStatus.Failed,
        summary: 'This repository has no refunds.',
        error: expect.stringMatching(/no hypothesis/i),
      });
    });

    it('fails when the space stopped allowing the agent', async () => {
      const pending = await started();
      const done = await useCase({ refusal: 'not allowed any more' }).run(pending.id);
      expect(done).toMatchObject({
        status: InvestigationStatus.Failed,
        error: 'not allowed any more',
      });
      expect(workspace.prepare).not.toHaveBeenCalled();
    });

    it('leaves an investigation that is not pending alone', async () => {
      await repo.create(investigation({ status: InvestigationStatus.Completed }));
      const done = await useCase().run('inv-1');
      expect(done.status).toBe(InvestigationStatus.Completed);
      expect(caller.call).not.toHaveBeenCalled();
    });

    it('rejects an unknown id', async () => {
      await expect(useCase().run('missing')).rejects.toThrow(/not found/);
    });
  });
});
