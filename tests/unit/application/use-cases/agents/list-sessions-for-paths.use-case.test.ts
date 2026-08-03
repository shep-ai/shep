/**
 * ListSessionsForPathsUseCase Unit Tests
 *
 * This use case absorbs the fan-out that previously lived inside the
 * /api/sessions-batch route (spec 105).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListSessionsForPathsUseCase } from '@/application/use-cases/agents/list-sessions-for-paths.use-case.js';
import type { IAgentSessionRepositoryRegistry } from '@/application/ports/output/agents/agent-session-repository-registry.interface.js';
import type { IAgentSessionRepository } from '@/application/ports/output/agents/agent-session-repository.interface.js';
import type { IClock } from '@/application/ports/output/services/clock.interface.js';
import type { AgentSession, AgentType } from '@/domain/generated/output.js';

function session(id: string, agentType: string, lastMessageAt: string): AgentSession {
  return {
    id,
    agentType: agentType as AgentType,
    projectPath: '/code/proj',
    messageCount: 2,
    createdAt: new Date(lastMessageAt),
    updatedAt: new Date(lastMessageAt),
    lastMessageAt: new Date(lastMessageAt),
  };
}

function repo(sessions: AgentSession[], supported = true): IAgentSessionRepository {
  return {
    isSupported: vi.fn().mockReturnValue(supported),
    list: vi.fn().mockResolvedValue(sessions),
    findById: vi.fn().mockResolvedValue(null),
  };
}

describe('ListSessionsForPathsUseCase', () => {
  let repositories: Record<string, IAgentSessionRepository>;
  let registry: IAgentSessionRepositoryRegistry;
  let clock: IClock;
  let now: Date;
  let useCase: ListSessionsForPathsUseCase;

  beforeEach(() => {
    now = new Date('2026-08-03T12:00:00Z');
    clock = { now: () => now };

    repositories = {
      'claude-code': repo([]),
      'codex-cli': repo([]),
      cursor: repo([]),
    };
    registry = {
      getRepository: (agentType: AgentType) => repositories[agentType as string] ?? repo([], false),
    };

    useCase = new ListSessionsForPathsUseCase(registry, clock);
  });

  it('returns an empty map for no specs', async () => {
    const result = await useCase.execute({ specs: [] });

    expect(result.sessionsByPath).toEqual({});
  });

  it('keys results by the requested path', async () => {
    repositories['claude-code'] = repo([session('s1', 'claude-code', '2026-08-01T00:00:00Z')]);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }] });

    expect(Object.keys(result.sessionsByPath)).toEqual(['/code/proj']);
    expect(result.sessionsByPath['/code/proj']).toHaveLength(1);
  });

  it('merges sessions from all supported providers', async () => {
    repositories['claude-code'] = repo([session('c1', 'claude-code', '2026-08-01T00:00:00Z')]);
    repositories['codex-cli'] = repo([session('x1', 'codex-cli', '2026-08-02T00:00:00Z')]);
    repositories.cursor = repo([session('u1', 'cursor', '2026-08-03T00:00:00Z')]);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }], limitPerPath: 10 });

    expect(result.sessionsByPath['/code/proj'].map((s) => s.id)).toEqual(['u1', 'x1', 'c1']);
  });

  it('sorts merged sessions by recency descending', async () => {
    repositories['claude-code'] = repo([
      session('old', 'claude-code', '2026-07-01T00:00:00Z'),
      session('new', 'claude-code', '2026-08-02T00:00:00Z'),
    ]);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }], limitPerPath: 10 });

    expect(result.sessionsByPath['/code/proj'].map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('applies the per-path limit after merging providers', async () => {
    repositories['claude-code'] = repo([
      session('c1', 'claude-code', '2026-08-01T00:00:00Z'),
      session('c2', 'claude-code', '2026-08-02T00:00:00Z'),
    ]);
    repositories.cursor = repo([session('u1', 'cursor', '2026-08-03T00:00:00Z')]);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }], limitPerPath: 2 });

    expect(result.sessionsByPath['/code/proj'].map((s) => s.id)).toEqual(['u1', 'c2']);
  });

  it('skips unsupported providers without querying them', async () => {
    repositories.cursor = repo([session('u1', 'cursor', '2026-08-03T00:00:00Z')], false);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }] });

    expect(repositories.cursor.list).not.toHaveBeenCalled();
    expect(result.sessionsByPath['/code/proj']).toEqual([]);
  });

  it('requests worktree inclusion only when the spec asks for it', async () => {
    await useCase.execute({
      specs: [
        { path: '/code/repo', includeWorktrees: true },
        { path: '/code/repo/wt/feat', includeWorktrees: false },
      ],
      limitPerPath: 5,
    });

    expect(repositories['claude-code'].list).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/code/repo', includeWorktrees: true })
    );
    expect(repositories['claude-code'].list).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/code/repo/wt/feat', includeWorktrees: false })
    );
  });

  it('collapses duplicate paths into one entry', async () => {
    const result = await useCase.execute({
      specs: [{ path: '/code/proj' }, { path: '/code/proj/' }],
    });

    expect(Object.keys(result.sessionsByPath)).toEqual(['/code/proj']);
  });

  it('keeps worktree inclusion when duplicates disagree', async () => {
    await useCase.execute({
      specs: [
        { path: '/code/proj', includeWorktrees: false },
        { path: '/code/proj', includeWorktrees: true },
      ],
    });

    expect(repositories['claude-code'].list).toHaveBeenCalledWith(
      expect.objectContaining({ includeWorktrees: true })
    );
  });

  it('survives a provider that throws', async () => {
    repositories['claude-code'] = {
      isSupported: vi.fn().mockReturnValue(true),
      list: vi.fn().mockRejectedValue(new Error('disk error')),
      findById: vi.fn(),
    };
    repositories.cursor = repo([session('u1', 'cursor', '2026-08-03T00:00:00Z')]);

    const result = await useCase.execute({ specs: [{ path: '/code/proj' }] });

    expect(result.sessionsByPath['/code/proj'].map((s) => s.id)).toEqual(['u1']);
  });

  it('serves a repeat request from cache within the TTL', async () => {
    await useCase.execute({ specs: [{ path: '/code/proj' }] });
    await useCase.execute({ specs: [{ path: '/code/proj' }] });

    // One call per provider, not two — the canvas polls this constantly.
    expect(repositories['claude-code'].list).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the cache TTL has elapsed', async () => {
    await useCase.execute({ specs: [{ path: '/code/proj' }] });
    now = new Date('2026-08-03T12:01:00Z'); // +60s, past the 30s TTL
    await useCase.execute({ specs: [{ path: '/code/proj' }] });

    expect(repositories['claude-code'].list).toHaveBeenCalledTimes(2);
  });

  it('re-queries when forceRefresh is set', async () => {
    await useCase.execute({ specs: [{ path: '/code/proj' }] });
    await useCase.execute({ specs: [{ path: '/code/proj' }], forceRefresh: true });

    expect(repositories['claude-code'].list).toHaveBeenCalledTimes(2);
  });

  it('does not serve cached data for a different set of paths', async () => {
    await useCase.execute({ specs: [{ path: '/code/a' }] });
    const result = await useCase.execute({ specs: [{ path: '/code/b' }] });

    expect(Object.keys(result.sessionsByPath)).toEqual(['/code/b']);
  });
});
