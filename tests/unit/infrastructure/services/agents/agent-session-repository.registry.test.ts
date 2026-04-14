/**
 * AgentSessionRepositoryRegistry Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSessionRepositoryRegistry } from '@/infrastructure/services/agents/agent-session-repository.registry.js';
import type { IAgentSessionRepository } from '@/application/ports/output/agents/agent-session-repository.interface.js';
import { AgentType } from '@/domain/generated/output.js';

// Mock the DI container
vi.mock('tsyringe', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    container: {
      resolve: vi.fn(),
    },
  };
});

describe('AgentSessionRepositoryRegistry', () => {
  let registry: AgentSessionRepositoryRegistry;
  let mockRepository: IAgentSessionRepository;
  let mockContainerResolve: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { container } = await import('tsyringe');
    mockContainerResolve = container.resolve as ReturnType<typeof vi.fn>;

    mockRepository = {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      isSupported: vi.fn().mockReturnValue(true),
    };
    mockContainerResolve.mockReturnValue(mockRepository);

    registry = new AgentSessionRepositoryRegistry();
  });

  it('should resolve the repository using the correct token for claude-code', () => {
    const repo = registry.getRepository(AgentType.ClaudeCode);
    expect(mockContainerResolve).toHaveBeenCalledWith(
      `IAgentSessionRepository:${AgentType.ClaudeCode}`
    );
    expect(repo).toBe(mockRepository);
  });

  it('should resolve the repository using the correct token for cursor', () => {
    const repo = registry.getRepository(AgentType.Cursor);
    expect(mockContainerResolve).toHaveBeenCalledWith(
      `IAgentSessionRepository:${AgentType.Cursor}`
    );
    expect(repo).toBe(mockRepository);
  });

  it('should resolve the repository using the correct token for gemini-cli', () => {
    const repo = registry.getRepository(AgentType.GeminiCli);
    expect(mockContainerResolve).toHaveBeenCalledWith(
      `IAgentSessionRepository:${AgentType.GeminiCli}`
    );
    expect(repo).toBe(mockRepository);
  });

  it('should return the resolved repository instance', () => {
    const anotherMockRepo: IAgentSessionRepository = {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      isSupported: vi.fn().mockReturnValue(false),
    };
    mockContainerResolve.mockReturnValue(anotherMockRepo);

    const repo = registry.getRepository(AgentType.ClaudeCode);
    expect(repo).toBe(anotherMockRepo);
  });
});
