import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAiCycleSummaryUseCase } from '@/application/use-cases/analytics/get-ai-cycle-summary.use-case.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { Cycle, WorkItem, WorkItemState } from '@/domain/generated/output.js';
import { CycleStatus, Priority, StateGroup, AgentType } from '@/domain/generated/output.js';

const now = new Date('2026-04-13T12:00:00Z');

const CYCLE: Cycle = {
  id: 'cycle-1',
  projectId: 'proj-1',
  name: 'Sprint 1',
  status: CycleStatus.Active,
  startDate: new Date('2026-04-01'),
  endDate: new Date('2026-04-14'),
  createdAt: now,
  updatedAt: now,
};

const STATES: WorkItemState[] = [
  {
    id: 'state-todo',
    projectId: 'proj-1',
    name: 'Todo',
    color: '#ccc',
    displayOrder: 0,
    stateGroup: StateGroup.Unstarted,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'state-inprog',
    projectId: 'proj-1',
    name: 'In Progress',
    color: '#00f',
    displayOrder: 1,
    stateGroup: StateGroup.Started,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'state-done',
    projectId: 'proj-1',
    name: 'Done',
    color: '#0f0',
    displayOrder: 2,
    stateGroup: StateGroup.Completed,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  },
];

function makeItem(stateId: string, title: string): WorkItem {
  return {
    id: `wi-${title}`,
    projectId: 'proj-1',
    sequenceId: 1,
    identifierPrefix: 'TST',
    title,
    stateId,
    priority: Priority.Medium,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createMockCycleRepo(): ICycleRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(CYCLE),
    listByProject: vi.fn().mockResolvedValue([]),
    findActiveByProject: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    addWorkItem: vi.fn(),
    removeWorkItem: vi.fn(),
    getWorkItemIds: vi.fn().mockResolvedValue([]),
    findCycleForWorkItem: vi.fn(),
  };
}

function createMockWorkItemRepo(): IWorkItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdentifier: vi.fn(),
    listByProject: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    addLabel: vi.fn(),
    removeLabel: vi.fn(),
    addAssignee: vi.fn(),
    removeAssignee: vi.fn(),
    getLabels: vi.fn(),
    getAssignees: vi.fn(),
  };
}

function createMockStateRepo(): IWorkItemStateRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByProject: vi.fn().mockResolvedValue(STATES),
    update: vi.fn(),
    softDelete: vi.fn(),
    seedDefaultStates: vi.fn(),
    reorder: vi.fn(),
  };
}

function createMockAgentProvider(): IAgentExecutorProvider {
  const executor: IAgentExecutor = {
    agentType: AgentType.ClaudeCode,
    execute: vi.fn().mockResolvedValue({
      result: JSON.stringify({
        summary: 'Sprint is on track with 2 of 4 items completed.',
        risks: ['Tight deadline for remaining items'],
      }),
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
  return {
    getExecutor: vi.fn().mockResolvedValue(executor),
  };
}

describe('GetAiCycleSummaryUseCase', () => {
  let useCase: GetAiCycleSummaryUseCase;
  let cycleRepo: ICycleRepository;
  let workItemRepo: IWorkItemRepository;
  let stateRepo: IWorkItemStateRepository;
  let agentProvider: IAgentExecutorProvider;

  beforeEach(() => {
    cycleRepo = createMockCycleRepo();
    workItemRepo = createMockWorkItemRepo();
    stateRepo = createMockStateRepo();
    agentProvider = createMockAgentProvider();
    useCase = new GetAiCycleSummaryUseCase(cycleRepo, workItemRepo, stateRepo, agentProvider);
  });

  it('returns AI-generated cycle summary with metrics', async () => {
    const items = [
      makeItem('state-done', 'Done task 1'),
      makeItem('state-done', 'Done task 2'),
      makeItem('state-inprog', 'In progress'),
      makeItem('state-todo', 'Todo item'),
    ];
    vi.mocked(cycleRepo.getWorkItemIds).mockResolvedValue(items.map((i) => i.id));
    vi.mocked(workItemRepo.findById)
      .mockResolvedValueOnce(items[0])
      .mockResolvedValueOnce(items[1])
      .mockResolvedValueOnce(items[2])
      .mockResolvedValueOnce(items[3]);

    const result = await useCase.execute({ cycleId: 'cycle-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.totalItems).toBe(4);
    expect(result.summary.completedItems).toBe(2);
    expect(result.summary.inProgressItems).toBe(1);
    expect(result.summary.aiSummary).toContain('on track');
  });

  it('returns error for nonexistent cycle', async () => {
    vi.mocked(cycleRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ cycleId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('handles agent execution failure gracefully', async () => {
    vi.mocked(cycleRepo.getWorkItemIds).mockResolvedValue(['wi-1']);
    vi.mocked(workItemRepo.findById).mockResolvedValue(makeItem('state-todo', 'Item'));
    const executor = await agentProvider.getExecutor();
    vi.mocked(executor.execute).mockRejectedValue(new Error('Agent unavailable'));

    const result = await useCase.execute({ cycleId: 'cycle-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should still return metrics even if AI fails
    expect(result.summary.totalItems).toBe(1);
    expect(result.summary.aiSummary).toBeDefined();
  });

  it('calls agent with cycle context in prompt', async () => {
    vi.mocked(cycleRepo.getWorkItemIds).mockResolvedValue(['wi-1']);
    vi.mocked(workItemRepo.findById).mockResolvedValue(makeItem('state-done', 'Done'));
    const executor = await agentProvider.getExecutor();

    await useCase.execute({ cycleId: 'cycle-1' });

    expect(executor.execute).toHaveBeenCalledOnce();
    const prompt = vi.mocked(executor.execute).mock.calls[0][0];
    expect(prompt).toContain('Sprint 1');
    expect(prompt).toContain('1'); // total items
  });
});
