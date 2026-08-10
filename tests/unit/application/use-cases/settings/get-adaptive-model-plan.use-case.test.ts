import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAdaptiveModelPlanUseCase } from '@/application/use-cases/settings/get-adaptive-model-plan.use-case.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { AgentType, type Settings } from '@/domain/generated/output.js';

function makeSettings(overrides?: (s: Settings) => void): Settings {
  const settings = createDefaultSettings();
  settings.agent.type = AgentType.ClaudeCode;
  settings.models.default = 'claude-opus-5';
  overrides?.(settings);
  return settings;
}

function makeFactory(): IAgentExecutorFactory {
  return {
    resolveAdaptiveModelPlan: vi.fn().mockReturnValue({
      high: 'claude-opus-5',
      medium: 'claude-sonnet-5',
      low: 'claude-haiku-4-5',
    }),
    getSupportedModels: vi.fn().mockReturnValue(['claude-opus-5', 'claude-haiku-4-5']),
    createExecutor: vi.fn(),
    getSupportedAgents: vi.fn(),
    getCliInfo: vi.fn(),
    listAvailableModels: vi.fn(),
    createInteractiveExecutor: vi.fn(),
    supportsInteractive: vi.fn(),
  } as unknown as IAgentExecutorFactory;
}

describe('GetAdaptiveModelPlanUseCase', () => {
  let repository: ISettingsRepository;
  let factory: IAgentExecutorFactory;
  let useCase: GetAdaptiveModelPlanUseCase;

  beforeEach(() => {
    repository = {
      load: vi.fn(),
      save: vi.fn(),
      initialize: vi.fn(),
      update: vi.fn(),
    } as unknown as ISettingsRepository;
    factory = makeFactory();
    useCase = new GetAdaptiveModelPlanUseCase(repository, factory);
  });

  it('throws a directive error when settings have never been initialized', async () => {
    vi.mocked(repository.load).mockResolvedValue(null);
    await expect(useCase.execute()).rejects.toThrow(/Settings not found/);
  });

  it('reports the mode as disabled when no adaptive config is stored', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());

    const plan = await useCase.execute();

    expect(plan.enabled).toBe(false);
    expect(plan.baseModel).toBe('claude-opus-5');
    expect(plan.agentType).toBe(AgentType.ClaudeCode);
  });

  it('resolves tiers through the factory port using the configured agent', async () => {
    vi.mocked(repository.load).mockResolvedValue(
      makeSettings((s) => {
        s.models.adaptive = { enabled: true };
      })
    );

    const plan = await useCase.execute();

    expect(plan.enabled).toBe(true);
    expect(factory.resolveAdaptiveModelPlan).toHaveBeenCalledWith(
      AgentType.ClaudeCode,
      'claude-opus-5',
      { high: undefined, medium: undefined, low: undefined }
    );
    expect(plan.tiers).toEqual({
      high: 'claude-opus-5',
      medium: 'claude-sonnet-5',
      low: 'claude-haiku-4-5',
    });
  });

  it('forwards stored per-tier overrides to the resolver and echoes them back', async () => {
    vi.mocked(repository.load).mockResolvedValue(
      makeSettings((s) => {
        s.models.adaptive = { enabled: true, low: 'claude-sonnet-4-6' };
      })
    );

    const plan = await useCase.execute();

    expect(factory.resolveAdaptiveModelPlan).toHaveBeenCalledWith(
      AgentType.ClaudeCode,
      'claude-opus-5',
      { high: undefined, medium: undefined, low: 'claude-sonnet-4-6' }
    );
    expect(plan.overrides.low).toBe('claude-sonnet-4-6');
  });

  it('previews an explicitly supplied model instead of the configured default', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());

    await useCase.execute('claude-sonnet-4-6');

    expect(factory.resolveAdaptiveModelPlan).toHaveBeenCalledWith(
      AgentType.ClaudeCode,
      'claude-sonnet-4-6',
      expect.anything()
    );
  });

  it('ignores a blank preview model and falls back to the configured default', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());

    const plan = await useCase.execute('   ');

    expect(plan.baseModel).toBe('claude-opus-5');
  });

  it('flags a pin that collapses every tier onto itself', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());
    vi.mocked(factory.resolveAdaptiveModelPlan).mockReturnValue({
      high: 'claude-opus-5',
      medium: 'claude-opus-5',
      low: 'claude-opus-5',
    });

    const plan = await useCase.execute();

    expect(plan.degradesToSingleModel).toBe(true);
  });

  it('does not flag a pin that genuinely spreads across tiers', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());

    const plan = await useCase.execute();

    expect(plan.degradesToSingleModel).toBe(false);
  });

  it('returns the agent supported-model list so surfaces can offer overrides', async () => {
    vi.mocked(repository.load).mockResolvedValue(makeSettings());

    const plan = await useCase.execute();

    expect(plan.supportedModels).toEqual(['claude-opus-5', 'claude-haiku-4-5']);
  });
});
