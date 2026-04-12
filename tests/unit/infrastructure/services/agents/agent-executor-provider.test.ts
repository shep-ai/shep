import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutorProvider } from '@/infrastructure/services/agents/common/agent-executor-provider.service.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

describe('AgentExecutorProvider', () => {
  let provider: AgentExecutorProvider;
  let mockFactory: IAgentExecutorFactory;
  let mockExecutor: IAgentExecutor;
  let mockSettingsRepo: ISettingsRepository;

  const defaultSettings = {
    agent: { type: 'claude-code' as const, authMethod: 'session' as const },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutor = {
      agentType: 'claude-code' as any,
      execute: vi.fn(),
      executeStream: vi.fn(),
      supportsFeature: vi.fn(),
    };
    mockFactory = {
      createExecutor: vi.fn().mockReturnValue(mockExecutor),
      getSupportedAgents: vi.fn(),
      getCliInfo: vi.fn().mockReturnValue([]),
      getSupportedModels: vi.fn().mockReturnValue([]),
      listAvailableModels: vi.fn().mockResolvedValue([]),
      createInteractiveExecutor: vi.fn(),
      supportsInteractive: vi.fn().mockReturnValue(false),
    };
    mockSettingsRepo = {
      load: vi.fn().mockResolvedValue(defaultSettings),
      initialize: vi.fn(),
      update: vi.fn(),
    };
    provider = new AgentExecutorProvider(mockFactory, mockSettingsRepo);
  });

  it('should load settings from repository and pass agent config to factory', async () => {
    await provider.getExecutor();

    expect(mockSettingsRepo.load).toHaveBeenCalledOnce();
    expect(mockFactory.createExecutor).toHaveBeenCalledWith('claude-code', {
      type: 'claude-code',
      authMethod: 'session',
    });
  });

  it('should return the executor from the factory', async () => {
    const result = await provider.getExecutor();

    expect(result).toBe(mockExecutor);
  });

  it('should use the configured agent type, not a hardcoded default', async () => {
    vi.mocked(mockSettingsRepo.load).mockResolvedValue({
      agent: { type: 'cursor', authMethod: 'token', token: 'abc' },
    } as any);

    await provider.getExecutor();

    expect(mockFactory.createExecutor).toHaveBeenCalledWith('cursor', {
      type: 'cursor',
      authMethod: 'token',
      token: 'abc',
    });
  });

  it('should throw if settings are not found', async () => {
    vi.mocked(mockSettingsRepo.load).mockResolvedValue(null);

    await expect(provider.getExecutor()).rejects.toThrow(
      'Settings not found. Please run initialization first.'
    );
  });

  it('should always read fresh settings from DB on each call', async () => {
    await provider.getExecutor();

    vi.mocked(mockSettingsRepo.load).mockResolvedValue({
      agent: { type: 'cursor', authMethod: 'token' },
    } as any);

    await provider.getExecutor();

    expect(mockSettingsRepo.load).toHaveBeenCalledTimes(2);
    expect(mockFactory.createExecutor).toHaveBeenLastCalledWith('cursor', {
      type: 'cursor',
      authMethod: 'token',
    });
  });
});
