/**
 * GetAgentSessionUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAgentSessionUseCase } from '@/application/use-cases/agents/get-agent-session.use-case.js';
import { SessionNotFoundError } from '@/domain/errors/session-not-found.error.js';
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
    messages: [],
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    ...overrides,
  };
}

describe('GetAgentSessionUseCase', () => {
  let useCase: GetAgentSessionUseCase;
  let mockRegistry: IAgentSessionRepositoryRegistry;
  let mockRepository: IAgentSessionRepository;
  let mockSettingsRepository: ISettingsRepository;

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

    useCase = new GetAgentSessionUseCase(mockRegistry, mockSettingsRepository);
  });

  it('should return the session when findById returns a session', async () => {
    const session = createMockSession({ id: 'abc123' });
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    const result = await useCase.execute({ id: 'abc123' });
    expect(result).toEqual(session);
  });

  it('should throw SessionNotFoundError when findById returns null', async () => {
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(useCase.execute({ id: 'missing' })).rejects.toThrow(SessionNotFoundError);
  });

  it('should include the session ID in the SessionNotFoundError', async () => {
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(useCase.execute({ id: 'missing-id' })).rejects.toThrow('missing-id');
  });

  it('should call findById with messageLimit 20 by default', async () => {
    const session = createMockSession();
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    await useCase.execute({ id: 'abc123' });
    expect(mockRepository.findById).toHaveBeenCalledWith('abc123', { messageLimit: 20 });
  });

  it('should call findById with the specified messageLimit', async () => {
    const session = createMockSession();
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    await useCase.execute({ id: 'abc123', messageLimit: 50 });
    expect(mockRepository.findById).toHaveBeenCalledWith('abc123', { messageLimit: 50 });
  });

  it('should call findById with messageLimit 0 to get all messages', async () => {
    const session = createMockSession();
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    await useCase.execute({ id: 'abc123', messageLimit: 0 });
    expect(mockRepository.findById).toHaveBeenCalledWith('abc123', { messageLimit: 0 });
  });

  it('should use the configured agent type from settings when no agentType is provided', async () => {
    const session = createMockSession();
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    await useCase.execute({ id: 'abc123' });
    expect(mockRegistry.getRepository).toHaveBeenCalledWith(AgentType.ClaudeCode);
  });

  it('should use the explicit agentType when provided in input', async () => {
    const session = createMockSession();
    (mockRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    await useCase.execute({ id: 'abc123', agentType: AgentType.GeminiCli });
    expect(mockRegistry.getRepository).toHaveBeenCalledWith(AgentType.GeminiCli);
  });
});
