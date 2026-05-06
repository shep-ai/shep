import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { DraftOutreachPostUseCase } from '@/application/use-cases/contributors/draft-outreach-post.use-case.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';

function provider(body: string): IAgentExecutorProvider {
  const executor: IAgentExecutor = {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({ result: body }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  };
  return { getExecutor: vi.fn().mockResolvedValue(executor) };
}

describe('DraftOutreachPostUseCase', () => {
  it('returns a Discord-channel draft containing the input title', async () => {
    const useCase = new DraftOutreachPostUseCase(
      provider('Brand new release dropped! Check it out.')
    );
    const result = await useCase.execute({
      kind: 'release',
      title: 'Shep v0.42.0',
      highlights: ['New `shep doctor` command', 'Contributor leaderboard'],
      link: 'https://github.com/shep-ai/shep/releases/tag/v0.42.0',
    });

    expect(result.channel).toBe('discord');
    expect(result.body).toContain('Shep v0.42.0');
    expect(result.body.length).toBeGreaterThan(0);
  });

  it('clamps draft body to the Discord 2000-character hard limit', async () => {
    const huge = 'x'.repeat(3000);
    const useCase = new DraftOutreachPostUseCase(provider(huge));
    const result = await useCase.execute({ kind: 'recap', title: 'April recap' });
    expect(result.body.length).toBeLessThanOrEqual(2000);
  });

  it('throws on empty title', async () => {
    const useCase = new DraftOutreachPostUseCase(provider('whatever'));
    await expect(useCase.execute({ kind: 'release', title: '   ' })).rejects.toThrow(
      /non-empty title/
    );
  });
});
