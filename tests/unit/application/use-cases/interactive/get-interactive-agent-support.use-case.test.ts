/**
 * GetInteractiveAgentSupportUseCase unit tests
 *
 * Lets a chat surface find out, before it tries, whether an agent can run an
 * interactive session — so it can explain the problem instead of letting the
 * user's first message fail.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GetInteractiveAgentSupportUseCase } from '@/application/use-cases/interactive/get-interactive-agent-support.use-case.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import { AgentType, type Settings } from '@/domain/generated/output.js';

function makeFactory(interactive: AgentType[]): IAgentExecutorFactory {
  return {
    supportsInteractive: vi.fn((agentType: AgentType) => interactive.includes(agentType)),
  } as unknown as IAgentExecutorFactory;
}

function makeSettings(agentType?: AgentType): ISettingsProvider {
  return {
    has: vi.fn(() => agentType !== undefined),
    get: vi.fn(() => ({ agent: { type: agentType } }) as unknown as Settings),
  } as unknown as ISettingsProvider;
}

/** Agents with an interactive executor today (see INTERACTIVE_EXECUTORS). */
const INTERACTIVE = [AgentType.ClaudeCode, AgentType.Cursor];

describe('GetInteractiveAgentSupportUseCase', () => {
  it('reports an agent that supports interactive sessions', async () => {
    const useCase = new GetInteractiveAgentSupportUseCase(
      makeFactory(INTERACTIVE),
      makeSettings(AgentType.ClaudeCode)
    );

    await expect(useCase.execute({ agentType: AgentType.ClaudeCode })).resolves.toEqual({
      agentType: AgentType.ClaudeCode,
      label: 'Claude Code',
      supported: true,
    });
  });

  it('reports Cursor as supported now that it has an interactive executor', async () => {
    const useCase = new GetInteractiveAgentSupportUseCase(
      makeFactory(INTERACTIVE),
      makeSettings(AgentType.ClaudeCode)
    );

    await expect(useCase.execute({ agentType: AgentType.Cursor })).resolves.toMatchObject({
      supported: true,
    });
  });

  it('reports an agent without interactive support, with its display label', async () => {
    const useCase = new GetInteractiveAgentSupportUseCase(
      makeFactory(INTERACTIVE),
      makeSettings(AgentType.ClaudeCode)
    );

    await expect(useCase.execute({ agentType: AgentType.GeminiCli })).resolves.toEqual({
      agentType: AgentType.GeminiCli,
      label: 'Gemini CLI',
      supported: false,
    });
  });

  it('falls back to the agent in settings when none is given', async () => {
    const factory = makeFactory(INTERACTIVE);
    const useCase = new GetInteractiveAgentSupportUseCase(
      factory,
      makeSettings(AgentType.GeminiCli)
    );

    const result = await useCase.execute({});

    expect(result).toMatchObject({ agentType: AgentType.GeminiCli, supported: false });
    expect(factory.supportsInteractive).toHaveBeenCalledWith(AgentType.GeminiCli);
  });

  // Without an agent or settings there is nothing to check yet; the session
  // resolves its own default when it boots, so no agent is assumed here.
  it('reports no blocker when no agent can be resolved yet', async () => {
    const factory = makeFactory([]);
    const useCase = new GetInteractiveAgentSupportUseCase(factory, makeSettings(undefined));

    await expect(useCase.execute({})).resolves.toEqual({ supported: true });
    expect(factory.supportsInteractive).not.toHaveBeenCalled();
  });
});
