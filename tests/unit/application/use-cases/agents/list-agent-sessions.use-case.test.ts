/**
 * ListAgentSessionsUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListAgentSessionsUseCase } from '@/application/use-cases/agents/list-agent-sessions.use-case.js';
import type { IAgentSessionRepositoryRegistry } from '@/application/ports/output/agents/agent-session-repository-registry.interface.js';
import type { IAgentSessionRepository } from '@/application/ports/output/agents/agent-session-repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { AgentSession, Settings } from '@/domain/generated/output.js';
import { AgentType } from '@/domain/generated/output.js';

function makeSettingsRepo(agentType = 'claude-code'): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ agent: { type: agentType } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    id: 'session-uuid-001',
    agentType: AgentType.ClaudeCode,
    projectPath: '~/repos/my-project',
    messageCount: 5,
    preview: 'Help me implement a feature',
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    ...overrides,
  };
}

describe('ListAgentSessionsUseCase', () => {
  let useCase: ListAgentSessionsUseCase;
  let mockRegistry: IAgentSessionRepositoryRegistry;
  let mockRepository: IAgentSessionRepository;
  let mockSettingsRepository: ISettingsRepository;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockRepository = {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      isSupported: vi.fn().mockReturnValue(true),
    };

    mockRegistry = {
      getRepository: vi.fn().mockReturnValue(mockRepository),
    } as unknown as IAgentSessionRepositoryRegistry;

    mockSettingsRepository = makeSettingsRepo();

    useCase = new ListAgentSessionsUseCase(mockRegistry, mockSettingsRepository);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('should use the configured agent type from settings when no agentType is provided', async () => {
    await useCase.execute();
    expect(mockRegistry.getRepository).toHaveBeenCalledWith(AgentType.ClaudeCode);
  });

  it('should use the explicit agentType when provided in input', async () => {
    await useCase.execute({ agentType: AgentType.GeminiCli });
    expect(mockRegistry.getRepository).toHaveBeenCalledWith(AgentType.GeminiCli);
  });

  it('should call repo.list with default limit of 20 when limit is not specified', async () => {
    await useCase.execute();
    expect(mockRepository.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it('should call repo.list with the specified limit when provided', async () => {
    await useCase.execute({ limit: 5 });
    expect(mockRepository.list).toHaveBeenCalledWith({ limit: 5 });
  });

  it('should call repo.list with limit 0 to get all sessions', async () => {
    await useCase.execute({ limit: 0 });
    expect(mockRepository.list).toHaveBeenCalledWith({ limit: 0 });
  });

  it('should return the sessions from the repository', async () => {
    const sessions = [
      createMockSession({ id: 'session-1' }),
      createMockSession({ id: 'session-2' }),
    ];
    (mockRepository.list as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const result = await useCase.execute();
    expect(result).toEqual(sessions);
  });

  it('should write a warning to stderr when the provider is not supported', async () => {
    (mockRepository.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockRegistry.getRepository = vi.fn().mockReturnValue(mockRepository);
    useCase = new ListAgentSessionsUseCase(mockRegistry, mockSettingsRepository);

    await useCase.execute({ agentType: AgentType.Cursor });

    expect(stderrSpy).toHaveBeenCalled();
    const writtenContent = (stderrSpy.mock.calls[0][0] as string).toString();
    expect(writtenContent).toContain(AgentType.Cursor);
  });

  it('should return empty array when the provider is not supported', async () => {
    (mockRepository.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await useCase.execute({ agentType: AgentType.Cursor });
    expect(result).toEqual([]);
  });

  it('should not call repo.list when the provider is not supported', async () => {
    (mockRepository.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await useCase.execute({ agentType: AgentType.Cursor });
    expect(mockRepository.list).not.toHaveBeenCalled();
  });
});
