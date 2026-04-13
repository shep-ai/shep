import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoTriageIntakeItemUseCase } from '@/application/use-cases/intake/auto-triage-intake-item.use-case.js';
import type { IIntakeItemRepository } from '@/application/ports/output/repositories/intake-item-repository.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IntakeItem } from '@/domain/generated/output.js';
import { IntakeStatus } from '@/domain/generated/output.js';

const PENDING_ITEM: IntakeItem = {
  id: 'intake-1',
  projectId: 'proj-1',
  title: 'Login button broken',
  description: 'Users cannot log in on mobile',
  source: 'manual',
  status: IntakeStatus.Pending,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockIntakeRepo(): IIntakeItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(PENDING_ITEM),
    listByProject: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn(),
  };
}

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({
      result: JSON.stringify({
        suggestedPriority: 'High',
        suggestedLabels: ['bug', 'mobile'],
        triageNotes: 'Mobile-specific login issue. High priority due to user impact.',
      }),
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  };
}

function createMockAgentProvider(executor: IAgentExecutor): IAgentExecutorProvider {
  return {
    getExecutor: vi.fn().mockResolvedValue(executor),
  };
}

describe('AutoTriageIntakeItemUseCase', () => {
  let useCase: AutoTriageIntakeItemUseCase;
  let intakeRepo: IIntakeItemRepository;
  let agentProvider: IAgentExecutorProvider;
  let executor: IAgentExecutor;

  beforeEach(() => {
    intakeRepo = createMockIntakeRepo();
    executor = createMockExecutor();
    agentProvider = createMockAgentProvider(executor);
    useCase = new AutoTriageIntakeItemUseCase(intakeRepo, agentProvider);
  });

  it('triages an intake item using AI and updates suggestions', async () => {
    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestions.suggestedPriority).toBe('High');
      expect(result.suggestions.triageNotes).toContain('Mobile');
    }
    expect(intakeRepo.update).toHaveBeenCalledWith(
      'intake-1',
      expect.objectContaining({
        suggestedPriority: 'High',
        triageNotes: expect.stringContaining('Mobile'),
      })
    );
  });

  it('returns error for nonexistent item', async () => {
    vi.mocked(intakeRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ intakeItemId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error when AI execution fails', async () => {
    vi.mocked(executor.execute).mockRejectedValue(new Error('Agent unavailable'));

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('triage failed');
  });

  it('handles malformed AI response gracefully', async () => {
    vi.mocked(executor.execute).mockResolvedValue({
      result: 'not valid json',
    });

    const result = await useCase.execute({ intakeItemId: 'intake-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('triage failed');
  });

  it('uses IAgentExecutorProvider, not hardcoded agent', async () => {
    await useCase.execute({ intakeItemId: 'intake-1' });

    expect(agentProvider.getExecutor).toHaveBeenCalledOnce();
  });
});
