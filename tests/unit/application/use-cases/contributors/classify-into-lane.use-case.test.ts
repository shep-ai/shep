import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ClassifyIntoLaneUseCase } from '@/application/use-cases/contributors/classify-into-lane.use-case.js';
import { ContributorLane } from '@/domain/generated/output.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';

function fakeProvider(executor?: IAgentExecutor): IAgentExecutorProvider {
  return {
    getExecutor: vi.fn().mockResolvedValue(
      executor ?? {
        agentType: 'ClaudeCode' as never,
        execute: vi.fn().mockResolvedValue({ result: '{}' }),
        executeStream: vi.fn(),
        supportsFeature: vi.fn().mockReturnValue(true),
      }
    ),
  };
}

function fakeExecutor(jsonResponse: object): IAgentExecutor {
  return {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({ result: JSON.stringify(jsonResponse) }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  };
}

describe('ClassifyIntoLaneUseCase', () => {
  it('routes by title prefix when one matches', async () => {
    const provider = fakeProvider();
    const useCase = new ClassifyIntoLaneUseCase(provider);

    const result = await useCase.execute({
      title: 'docs: clarify install steps',
      body: 'README is missing pnpm install instructions.',
    });

    expect(result.lane).toBe(ContributorLane.Docs);
    expect(result.source).toBe('rules');
    expect(provider.getExecutor).not.toHaveBeenCalled();
  });

  it('routes by body keyword when title is generic', async () => {
    const provider = fakeProvider();
    const useCase = new ClassifyIntoLaneUseCase(provider);

    const result = await useCase.execute({
      title: 'Add streaming to feature agent',
      body: 'We should improve our LLM prompt for better results.',
    });

    expect(result.lane).toBe(ContributorLane.Agents);
    expect(result.source).toBe('rules');
    expect(provider.getExecutor).not.toHaveBeenCalled();
  });

  it('routes by single matching label hint', async () => {
    const provider = fakeProvider();
    const useCase = new ClassifyIntoLaneUseCase(provider);

    const result = await useCase.execute({
      title: 'Fix something',
      body: 'It does not work.',
      existingLabels: ['ci', 'help-wanted'],
    });

    expect(result.lane).toBe(ContributorLane.Infra);
    expect(result.source).toBe('rules');
    expect(provider.getExecutor).not.toHaveBeenCalled();
  });

  it('falls back to the agent when rules are ambiguous', async () => {
    const executor = fakeExecutor({ lane: 'agents', rationale: 'mentions multi-agent flows' });
    const provider = fakeProvider(executor);
    const useCase = new ClassifyIntoLaneUseCase(provider);

    const result = await useCase.execute({
      title: 'Reduce coupling between modules',
      body: 'Several pieces should communicate more cleanly. No specific subsystem.',
    });

    expect(result.lane).toBe(ContributorLane.Agents);
    expect(result.source).toBe('agent');
    expect(provider.getExecutor).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an agent response with an invalid lane value', async () => {
    const executor = fakeExecutor({ lane: 'not-a-lane' });
    const provider = fakeProvider(executor);
    const useCase = new ClassifyIntoLaneUseCase(provider);

    await expect(useCase.execute({ title: 'unknown topic', body: 'no signals' })).rejects.toThrow(
      /invalid lane/i
    );
  });
});
