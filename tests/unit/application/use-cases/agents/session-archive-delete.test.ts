/**
 * ArchiveAgentSessionUseCase + DeleteAgentSessionUseCase Unit Tests
 *
 * The two guarantees that matter (spec 106): archiving cannot touch a provider
 * file, and deleting a transcript never damages the feature adopted from it.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArchiveAgentSessionUseCase } from '@/application/use-cases/agents/archive-agent-session.use-case.js';
import {
  DeleteAgentSessionUseCase,
  SessionDeletionUnsupportedError,
} from '@/application/use-cases/agents/delete-agent-session.use-case.js';
import type { IArchivedSessionRepository } from '@/application/ports/output/repositories/archived-session.repository.interface.js';
import type { IAgentSessionRepositoryRegistry } from '@/application/ports/output/agents/agent-session-repository-registry.interface.js';
import type { IAgentSessionRepository } from '@/application/ports/output/agents/agent-session-repository.interface.js';

const CLAUDE = 'claude-code';

describe('ArchiveAgentSessionUseCase', () => {
  let archived: IArchivedSessionRepository;
  let useCase: ArchiveAgentSessionUseCase;

  beforeEach(() => {
    archived = {
      archive: vi.fn().mockResolvedValue(undefined),
      unarchive: vi.fn().mockResolvedValue(undefined),
      isArchived: vi.fn().mockResolvedValue(false),
      listArchivedIds: vi.fn(),
      listAllArchivedIds: vi.fn(),
    };
    useCase = new ArchiveAgentSessionUseCase(archived);
  });

  it('archives through the marker repository', async () => {
    await useCase.archive({ sessionId: 's1', agentType: CLAUDE });

    expect(archived.archive).toHaveBeenCalledWith({ sessionId: 's1', agentType: CLAUDE });
  });

  it('unarchives through the marker repository', async () => {
    await useCase.unarchive({ sessionId: 's1', agentType: CLAUDE });

    expect(archived.unarchive).toHaveBeenCalledWith({ sessionId: 's1', agentType: CLAUDE });
  });

  it('is idempotent when archiving twice', async () => {
    await useCase.archive({ sessionId: 's1', agentType: CLAUDE });
    await useCase.archive({ sessionId: 's1', agentType: CLAUDE });

    expect(archived.archive).toHaveBeenCalledTimes(2);
  });

  it('rejects a request with no session id', async () => {
    await expect(useCase.archive({ sessionId: '', agentType: CLAUDE })).rejects.toThrow(
      /required/i
    );
  });

  it('has no collaborator capable of touching a provider file', () => {
    // Structural guarantee: the only dependency is the marker repository, so
    // archiving cannot modify or remove a transcript even by mistake.
    expect(useCase).toHaveProperty('archived');
    const collaborators = Object.values(useCase as unknown as Record<string, unknown>);
    expect(collaborators).toHaveLength(1);
    expect(collaborators[0]).toBe(archived);
  });
});

describe('DeleteAgentSessionUseCase', () => {
  let repository: IAgentSessionRepository & { delete?: ReturnType<typeof vi.fn> };
  let registry: IAgentSessionRepositoryRegistry;
  let useCase: DeleteAgentSessionUseCase;

  beforeEach(() => {
    repository = {
      isSupported: vi.fn().mockReturnValue(true),
      list: vi.fn(),
      findById: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
    };
    registry = { getRepository: () => repository };
    useCase = new DeleteAgentSessionUseCase(registry);
  });

  it('deletes through the provider repository', async () => {
    const result = await useCase.execute({ sessionId: 's1', agentType: CLAUDE });

    expect(repository.delete).toHaveBeenCalledWith('s1');
    expect(result.deleted).toBe(true);
  });

  it('reports deleted=false when no transcript was found', async () => {
    repository.delete = vi.fn().mockResolvedValue(false);

    const result = await useCase.execute({ sessionId: 'ghost', agentType: CLAUDE });

    expect(result.deleted).toBe(false);
  });

  it('refuses when the provider does not implement delete', async () => {
    delete repository.delete;

    await expect(useCase.execute({ sessionId: 's1', agentType: 'aider' })).rejects.toThrow(
      SessionDeletionUnsupportedError
    );
  });

  it('refuses when the provider is unsupported entirely', async () => {
    vi.mocked(repository.isSupported).mockReturnValue(false);

    await expect(useCase.execute({ sessionId: 's1', agentType: 'gemini-cli' })).rejects.toThrow(
      SessionDeletionUnsupportedError
    );
  });

  it('reports deletion capability without deleting anything', () => {
    expect(useCase.supportsDeletion(CLAUDE)).toBe(true);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('has no feature repository collaborator, so deletion cannot cascade', () => {
    // The adopted feature is independent data; a dangling
    // sourceAgentSessionId is accepted by design.
    const collaborators = Object.values(useCase as unknown as Record<string, unknown>);
    expect(collaborators).toHaveLength(1);
    expect(collaborators[0]).toBe(registry);
  });

  it('rejects a request with no session id', async () => {
    await expect(useCase.execute({ sessionId: '', agentType: CLAUDE })).rejects.toThrow(
      /required/i
    );
  });
});
