import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { ProposeAcceptanceCriteriaUseCase } from '@/application/use-cases/contributors/propose-acceptance-criteria.use-case.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';

function fakeExecutor(jsonResponse: object): IAgentExecutor {
  return {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({ result: JSON.stringify(jsonResponse) }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  };
}

function fakeProvider(executor: IAgentExecutor): IAgentExecutorProvider {
  return { getExecutor: vi.fn().mockResolvedValue(executor) };
}

describe('ProposeAcceptanceCriteriaUseCase', () => {
  it('returns a markdown checklist with at least two checkboxes', async () => {
    const executor = fakeExecutor({
      criteria: [
        '- [ ] Login button visible on the mobile homepage',
        '- [ ] Tapping the button opens the login modal',
        '- [ ] Login completes when valid credentials are submitted',
      ],
    });
    const useCase = new ProposeAcceptanceCriteriaUseCase(fakeProvider(executor));

    const result = await useCase.execute({
      title: 'Login broken on mobile',
      body: 'Tapping the login button on small screens does nothing.',
    });

    expect(result.criteria.length).toBeGreaterThanOrEqual(2);
    for (const line of result.criteria) {
      expect(line.startsWith('- [ ] ')).toBe(true);
    }
    expect(result.markdown).toContain('- [ ] ');
  });

  it('produces identical output on repeat calls with the same body', async () => {
    const executor = fakeExecutor({
      criteria: ['- [ ] First criterion', '- [ ] Second criterion'],
    });
    const useCase = new ProposeAcceptanceCriteriaUseCase(fakeProvider(executor));

    const a = await useCase.execute({ body: 'Same input.' });
    const b = await useCase.execute({ body: 'Same input.' });

    expect(a).toEqual(b);
  });

  it('normalizes criteria that arrive without checkbox prefix', async () => {
    const executor = fakeExecutor({
      criteria: ['User can sign in', 'Errors surface inline'],
    });
    const useCase = new ProposeAcceptanceCriteriaUseCase(fakeProvider(executor));

    const result = await useCase.execute({ body: 'doesnt matter' });

    expect(result.criteria).toEqual(['- [ ] User can sign in', '- [ ] Errors surface inline']);
  });

  it('throws when the agent returns fewer than two criteria', async () => {
    const executor = fakeExecutor({ criteria: ['- [ ] only one'] });
    const useCase = new ProposeAcceptanceCriteriaUseCase(fakeProvider(executor));

    await expect(useCase.execute({ body: 'short' })).rejects.toThrow(/too few/i);
  });
});
