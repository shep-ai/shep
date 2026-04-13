import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAiProjectHealthUseCase } from '@/application/use-cases/analytics/get-ai-project-health.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { PmProject, WorkItem, Cycle, WorkItemState } from '@/domain/generated/output.js';
import {
  EstimateType,
  CycleStatus,
  Priority,
  StateGroup,
  AgentType,
} from '@/domain/generated/output.js';

const now = new Date('2026-04-13T12:00:00Z');

const PROJECT: PmProject = {
  id: 'proj-1',
  name: 'Test Project',
  slug: 'test',
  identifierPrefix: 'TST',
  workItemCounter: 10,
  estimateType: EstimateType.Category,
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

function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: 'cycle-1',
    projectId: 'proj-1',
    name: 'Sprint 1',
    status: CycleStatus.Active,
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-04-14'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockProjectRepo(): IPmProjectRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(PROJECT),
    findBySlug: vi.fn(),
    findByIdentifierPrefix: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    incrementWorkItemCounter: vi.fn(),
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

function createMockCycleRepo(): ICycleRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
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
        overallScore: 72,
        narrativeSummary: 'Project is progressing well with minor risks.',
        recommendations: ['Consider adding more tests', 'Review blocked items'],
      }),
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
  return {
    getExecutor: vi.fn().mockResolvedValue(executor),
  };
}

describe('GetAiProjectHealthUseCase', () => {
  let useCase: GetAiProjectHealthUseCase;
  let projectRepo: IPmProjectRepository;
  let workItemRepo: IWorkItemRepository;
  let cycleRepo: ICycleRepository;
  let stateRepo: IWorkItemStateRepository;
  let agentProvider: IAgentExecutorProvider;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    workItemRepo = createMockWorkItemRepo();
    cycleRepo = createMockCycleRepo();
    stateRepo = createMockStateRepo();
    agentProvider = createMockAgentProvider();
    useCase = new GetAiProjectHealthUseCase(
      projectRepo,
      workItemRepo,
      cycleRepo,
      stateRepo,
      agentProvider
    );
  });

  it('returns AI-generated project health assessment', async () => {
    const items = [
      makeItem('state-done', 'Done 1'),
      makeItem('state-done', 'Done 2'),
      makeItem('state-todo', 'Todo 1'),
    ];
    vi.mocked(workItemRepo.listByProject).mockResolvedValue(items);
    vi.mocked(cycleRepo.listByProject).mockResolvedValue([makeCycle()]);

    const result = await useCase.execute({ projectId: 'proj-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.health.totalItems).toBe(3);
    expect(result.health.completedItems).toBe(2);
    expect(result.health.completionPercentage).toBeCloseTo(66.67, 0);
    expect(result.health.aiSummary).toContain('progressing well');
  });

  it('returns error for nonexistent project', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ projectId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('handles agent failure gracefully and still returns metrics', async () => {
    vi.mocked(workItemRepo.listByProject).mockResolvedValue([makeItem('state-todo', 'Item')]);
    vi.mocked(cycleRepo.listByProject).mockResolvedValue([]);
    const executor = await agentProvider.getExecutor();
    vi.mocked(executor.execute).mockRejectedValue(new Error('Agent down'));

    const result = await useCase.execute({ projectId: 'proj-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.health.totalItems).toBe(1);
    expect(result.health.aiSummary).toBeDefined();
  });

  it('calls agent with project context in prompt', async () => {
    vi.mocked(workItemRepo.listByProject).mockResolvedValue([
      makeItem('state-done', 'Done'),
      makeItem('state-todo', 'Todo'),
    ]);
    vi.mocked(cycleRepo.listByProject).mockResolvedValue([makeCycle()]);
    const executor = await agentProvider.getExecutor();

    await useCase.execute({ projectId: 'proj-1' });

    expect(executor.execute).toHaveBeenCalledOnce();
    const prompt = vi.mocked(executor.execute).mock.calls[0][0];
    expect(prompt).toContain('Test Project');
    expect(prompt).toContain('2'); // total items
  });

  it('calculates correct metrics with empty project', async () => {
    vi.mocked(workItemRepo.listByProject).mockResolvedValue([]);
    vi.mocked(cycleRepo.listByProject).mockResolvedValue([]);

    const result = await useCase.execute({ projectId: 'proj-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.health.totalItems).toBe(0);
    expect(result.health.completedItems).toBe(0);
    expect(result.health.completionPercentage).toBe(0);
  });
});
