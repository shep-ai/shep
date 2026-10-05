import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApproveHypothesisUseCase } from '@/application/use-cases/bug-loop/approve-hypothesis.use-case.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { UpdateWorkItemUseCase } from '@/application/use-cases/work-items/update-work-item.use-case.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import {
  AgentType,
  BuildMode,
  HypothesisConfidence,
  InvestigationStatus,
  StateGroup,
  type Feature,
  type WorkItemState,
} from '@/domain/generated/output.js';
import { InMemoryInvestigations } from '../../../../helpers/investigation-repository.mock.js';
import { T0, WORK_ITEM, fakeGetWorkItem, investigation } from './bug-loop.fixtures.js';

const COMPLETED = investigation({
  status: InvestigationStatus.Completed,
  commitSha: 'c0ffee1234567',
  summary: 'Guest orders have no customer.',
  hypotheses: [
    {
      number: 1,
      title: 'Guest customer id is null',
      rootCause: 'refund() reads order.customer.id',
      confidence: HypothesisConfidence.High,
      evidence: [
        { file: 'src/refund.ts', line: 18, note: 'reads customer.id' },
        { file: 'src/order.ts', note: 'customer is optional' },
      ],
      testPlan: 'Refund a guest order in tests/refund.test.ts',
      fixPlan: 'Fall back to the order email',
    },
    {
      number: 2,
      title: 'Cache',
      rootCause: 'stale cache',
      confidence: HypothesisConfidence.Low,
      evidence: [],
      testPlan: 't',
      fixPlan: 'f',
    },
  ],
});

const STATES = [
  { id: 'st-todo', stateGroup: StateGroup.Unstarted, displayOrder: 1, isDefault: true },
  { id: 'st-doing', stateGroup: StateGroup.Started, displayOrder: 2, isDefault: false },
] as WorkItemState[];

const FEATURE = { id: 'feat-1', name: 'Fix PAY-42' } as Feature;

describe('ApproveHypothesisUseCase', () => {
  let repo: InMemoryInvestigations;
  let createFeature: {
    createRecord: ReturnType<typeof vi.fn>;
    initializeAndSpawn: ReturnType<typeof vi.fn>;
  };
  let updateWorkItem: { execute: ReturnType<typeof vi.fn> };
  let states: { listByProject: ReturnType<typeof vi.fn> };

  function useCase(items = [WORK_ITEM]) {
    return new ApproveHypothesisUseCase(
      repo,
      fakeGetWorkItem(items),
      createFeature as unknown as CreateFeatureUseCase,
      updateWorkItem as unknown as UpdateWorkItemUseCase,
      states as unknown as IWorkItemStateRepository
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: T0 });
    repo = new InMemoryInvestigations();
    await repo.create(COMPLETED);
    createFeature = {
      createRecord: vi.fn(async () => ({ feature: FEATURE, shouldSpawn: true, queued: false })),
      initializeAndSpawn: vi.fn(async () => ({ updatedFeature: FEATURE })),
    };
    updateWorkItem = { execute: vi.fn(async () => ({ ok: true })) };
    states = { listByProject: vi.fn(async () => STATES) };
    return () => vi.useRealTimers();
  });

  it('creates a fast fix feature in the investigated repository from the hypothesis', async () => {
    const result = await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feature).toBe(FEATURE);

    const [input] = createFeature.createRecord.mock.calls[0];
    expect(input).toMatchObject({
      repositoryPath: '/src/pay',
      buildMode: BuildMode.Fast,
      name: 'Fix PAY-42: Guest customer id is null',
      description: 'refund() reads order.customer.id',
      agentType: AgentType.ClaudeCode,
    });
    expect(input.userInput).toContain('PAY-42');
    expect(input.userInput).toContain(WORK_ITEM.title);
    expect(input.userInput).toContain('refund() reads order.customer.id');
    expect(input.userInput).toContain('src/refund.ts:18');
    expect(input.userInput).toContain('src/order.ts');
    expect(input.userInput).toContain('Refund a guest order in tests/refund.test.ts');
    expect(input.userInput).toContain('Fall back to the order email');
    expect(input.userInput).toContain('c0ffee1');
    expect(input.userInput).toMatch(/failing test first/i);

    expect(createFeature.initializeAndSpawn).toHaveBeenCalledWith(FEATURE, input, true);
    await expect(result.started).resolves.toEqual({});
  });

  it('records the approval and moves the work item to Started', async () => {
    const result = await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 });
    expect(result.ok && result.investigation).toMatchObject({
      approvedHypothesisNumber: 1,
      featureId: 'feat-1',
    });
    expect((await repo.findById(COMPLETED.id))?.featureId).toBe('feat-1');
    expect(updateWorkItem.execute).toHaveBeenCalledWith(WORK_ITEM.id, { stateId: 'st-doing' });
  });

  it('leaves a work item already in a Started state where it is', async () => {
    await useCase([{ ...WORK_ITEM, stateId: 'st-doing' }]).execute({
      workItem: 'PAY-42',
      hypothesis: 1,
    });
    expect(updateWorkItem.execute).not.toHaveBeenCalled();
  });

  it('runs the full spec pipeline and another agent when asked', async () => {
    await useCase().execute({
      workItem: 'PAY-42',
      hypothesis: 2,
      fullSpec: true,
      agentType: AgentType.CodexCli,
    });
    expect(createFeature.createRecord.mock.calls[0][0]).toMatchObject({
      buildMode: BuildMode.Application,
      agentType: AgentType.CodexCli,
      name: 'Fix PAY-42: Cache',
    });
  });

  it('describes the fix feature by the root cause it fixes', async () => {
    await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 });
    expect(createFeature.createRecord.mock.calls[0][0].description).toBeTruthy();
  });

  it('passes approval gates on to the fix feature (spec 132)', async () => {
    const approvalGates = { allowPrd: true, allowPlan: true, allowMerge: false };
    await useCase().execute({ workItem: 'PAY-42', hypothesis: 1, approvalGates });
    expect(createFeature.createRecord.mock.calls[0][0]).toMatchObject({ approvalGates });
  });

  it('reports a failed start through `started` without rejecting', async () => {
    createFeature.initializeAndSpawn.mockRejectedValue(new Error('worktree exists'));
    const result = await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 });
    await expect(result.ok && result.started).resolves.toEqual({ error: 'worktree exists' });
  });

  it('passes on a start warning', async () => {
    createFeature.initializeAndSpawn.mockResolvedValue({ updatedFeature: FEATURE, warning: 'w' });
    const result = await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 });
    await expect(result.ok && result.started).resolves.toEqual({ warning: 'w' });
  });

  it('uses the named investigation when given', async () => {
    await repo.create({ ...COMPLETED, id: 'inv-2', repositoryPath: '/src/other', createdAt: T0 });
    await useCase().execute({ workItem: 'PAY-42', investigationId: 'inv-2', hypothesis: 1 });
    expect(createFeature.createRecord.mock.calls[0][0].repositoryPath).toBe('/src/other');
  });

  it('refuses an investigation of another work item', async () => {
    await repo.create({ ...COMPLETED, id: 'inv-x', workItemId: 'other' });
    expect(
      await useCase().execute({ workItem: 'PAY-42', investigationId: 'inv-x', hypothesis: 1 })
    ).toEqual({ ok: false, error: expect.stringMatching(/not found/i) });
  });

  it('refuses when there is no completed investigation', async () => {
    repo.rows.clear();
    await repo.create(investigation({ status: InvestigationStatus.Running }));
    expect(await useCase().execute({ workItem: 'PAY-42', hypothesis: 1 })).toEqual({
      ok: false,
      error: expect.stringMatching(/no completed investigation/i),
    });
  });

  it('refuses a hypothesis number that does not exist', async () => {
    expect(await useCase().execute({ workItem: 'PAY-42', hypothesis: 7 })).toEqual({
      ok: false,
      error: expect.stringMatching(/no hypothesis 7/i),
    });
  });

  it('refuses a second approval of the same investigation', async () => {
    await repo.update({ ...COMPLETED, approvedHypothesisNumber: 1, featureId: 'feat-0' });
    expect(await useCase().execute({ workItem: 'PAY-42', hypothesis: 2 })).toEqual({
      ok: false,
      error: expect.stringMatching(/already.*feat-0/i),
    });
    expect(createFeature.createRecord).not.toHaveBeenCalled();
  });

  it('refuses an unknown work item', async () => {
    expect(await useCase().execute({ workItem: 'PAY-9', hypothesis: 1 })).toEqual({
      ok: false,
      error: 'Work item not found: "PAY-9"',
    });
  });
});
