import { describe, it, expect } from 'vitest';
import { AgentType } from '@/domain/generated/output.js';
import {
  HarnessBackendUnavailableError,
  HarnessModelProviderFactory,
  resolveBackendCredential,
} from '@/infrastructure/services/harness/model/harness-model-provider-factory.js';
import { AgentExecutorFactory } from '@/infrastructure/services/agents/common/agent-executor-factory.service.js';
import { AgentAuthMethod } from '@/domain/generated/output.js';

describe('HarnessModelProviderFactory', () => {
  it('prefers the configured credential and falls back to the backend env var', () => {
    expect(
      resolveBackendCredential(AgentType.OpenRouter, 'sk-a', { OPENROUTER_API_KEY: 'sk-env' })
    ).toBe('sk-a');
    expect(
      resolveBackendCredential(AgentType.OpenRouter, '  ', { OPENROUTER_API_KEY: 'sk-env' })
    ).toBe('sk-env');
    expect(resolveBackendCredential(AgentType.OpenRouter, undefined, {})).toBeUndefined();
  });

  it('hardens local base URLs (no metadata endpoints, no non-URLs)', () => {
    expect(
      resolveBackendCredential(AgentType.Ollama, 'http://169.254.169.254/v1', {})
    ).toBeUndefined();
    expect(resolveBackendCredential(AgentType.Ollama, 'sk-not-a-url', {})).toBeUndefined();
    expect(
      resolveBackendCredential(AgentType.Ollama, undefined, {
        OLLAMA_BASE_URL: 'http://gpu:11434/v1',
      })
    ).toBe('http://gpu:11434/v1');
  });

  it('builds a provider with the default or requested model', () => {
    const f = new HarnessModelProviderFactory({ OPENROUTER_API_KEY: 'sk-env' });
    expect(f.create({ backendAgentType: AgentType.OpenRouter }).modelId).toBe(
      'anthropic/claude-sonnet-4.5'
    );
    expect(f.create({ backendAgentType: AgentType.Ollama, modelId: 'qwen2.5-coder' }).modelId).toBe(
      'qwen2.5-coder'
    );
  });

  it('refuses a hosted backend without a key and a non-SDK backend', () => {
    const f = new HarnessModelProviderFactory({});
    expect(() => f.create({ backendAgentType: AgentType.TogetherAi })).toThrow(/TOGETHER_API_KEY/);
    expect(() => f.create({ backendAgentType: AgentType.ClaudeCode })).toThrow(
      HarnessBackendUnavailableError
    );
  });
});

describe('AgentExecutorFactory — shep-harness', () => {
  const auth = { type: AgentType.ShepHarness, authMethod: AgentAuthMethod.Token };

  it('builds the harness executor from the DI-provided builder', () => {
    const executor = { agentType: AgentType.ShepHarness } as never;
    const factory = new AgentExecutorFactory((() => undefined) as never, undefined, {
      [AgentType.ShepHarness]: () => executor,
    });
    expect(factory.createExecutor(AgentType.ShepHarness, auth)).toBe(executor);
  });

  it('reports the harness as unavailable when no builder was registered', () => {
    const factory = new AgentExecutorFactory((() => undefined) as never);
    expect(() => factory.createExecutor(AgentType.ShepHarness, auth)).toThrow(/not registered/);
  });
});
