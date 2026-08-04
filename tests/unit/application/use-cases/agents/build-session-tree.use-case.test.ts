/**
 * BuildSessionTreeUseCase Unit Tests
 *
 * The tree's one domain rule: a session is adopted iff some feature's
 * sourceAgentSessionId equals its id (spec 106). Everything else is bucketing.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BuildSessionTreeUseCase } from '@/application/use-cases/agents/build-session-tree.use-case.js';
import type { ListRepositoriesUseCase } from '@/application/use-cases/repositories/list-repositories.use-case.js';
import type { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { ListSessionsForPathsUseCase } from '@/application/use-cases/agents/list-sessions-for-paths.use-case.js';
import type { IArchivedSessionRepository } from '@/application/ports/output/repositories/archived-session.repository.interface.js';
import type { AgentSession, AgentType, Feature, Repository } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';

const REPO_PATH = '/code/proj';

function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-1',
    name: 'proj',
    path: REPO_PATH,
    bedrockEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Billing refactor',
    slug: 'billing-refactor',
    description: 'd',
    userQuery: 'q',
    repositoryPath: REPO_PATH,
    branch: 'feature/billing-refactor',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function session(id: string, overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id,
    agentType: 'claude-code' as AgentType,
    projectPath: REPO_PATH,
    messageCount: 4,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    lastMessageAt: new Date('2026-08-02T00:00:00Z'),
    preview: `preview ${id}`,
    filePath: `/transcripts/${id}.jsonl`,
    ...overrides,
  };
}

describe('BuildSessionTreeUseCase', () => {
  let listRepositories: ListRepositoriesUseCase;
  let listFeatures: ListFeaturesUseCase;
  let listSessions: ListSessionsForPathsUseCase;
  let archived: IArchivedSessionRepository;
  let useCase: BuildSessionTreeUseCase;

  beforeEach(() => {
    listRepositories = {
      execute: vi.fn().mockResolvedValue([repo()]),
    } as unknown as ListRepositoriesUseCase;
    listFeatures = { execute: vi.fn().mockResolvedValue([]) } as unknown as ListFeaturesUseCase;
    listSessions = {
      execute: vi.fn().mockResolvedValue({ sessionsByPath: {} }),
    } as unknown as ListSessionsForPathsUseCase;
    archived = {
      archive: vi.fn(),
      unarchive: vi.fn(),
      isArchived: vi.fn(),
      listArchivedIds: vi.fn(),
      listAllArchivedIds: vi.fn().mockResolvedValue(new Map()),
    };

    useCase = new BuildSessionTreeUseCase(listRepositories, listFeatures, listSessions, archived);
  });

  it('returns one node per repository', async () => {
    const result = await useCase.execute();

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0].path).toBe(REPO_PATH);
  });

  it('requests worktree sessions for every repository path', async () => {
    await useCase.execute();

    expect(listSessions.execute).toHaveBeenCalledWith(
      expect.objectContaining({ specs: [{ path: REPO_PATH, includeWorktrees: true }] })
    );
  });

  it('nests an adopted session under the feature that adopted it', async () => {
    vi.mocked(listFeatures.execute).mockResolvedValue([
      feature({ id: 'feat-1', sourceAgentSessionId: 's1' }),
    ]);
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('s1')] },
    });

    const result = await useCase.execute();
    const repoNode = result.repositories[0];

    expect(repoNode.features).toHaveLength(1);
    expect(repoNode.features[0].sessions.map((s) => s.id)).toEqual(['s1']);
    expect(repoNode.features[0].sessions[0].adopted).toBe(true);
    expect(repoNode.unadoptedSessions).toEqual([]);
  });

  it('puts a session no feature adopted into the unadopted bucket', async () => {
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('loose')] },
    });

    const result = await useCase.execute();

    expect(result.repositories[0].unadoptedSessions.map((s) => s.id)).toEqual(['loose']);
    expect(result.repositories[0].unadoptedSessions[0].adopted).toBe(false);
  });

  it('separates adopted and unadopted sessions in the same repository', async () => {
    vi.mocked(listFeatures.execute).mockResolvedValue([
      feature({ id: 'feat-1', sourceAgentSessionId: 'adopted' }),
    ]);
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('adopted'), session('loose')] },
    });

    const result = await useCase.execute();
    const repoNode = result.repositories[0];

    expect(repoNode.features[0].sessions.map((s) => s.id)).toEqual(['adopted']);
    expect(repoNode.unadoptedSessions.map((s) => s.id)).toEqual(['loose']);
    expect(repoNode.sessionCount).toBe(2);
  });

  it('lists a feature with no adopted session and no sessions under it', async () => {
    vi.mocked(listFeatures.execute).mockResolvedValue([feature({ id: 'feat-1' })]);

    const result = await useCase.execute();

    expect(result.repositories[0].features).toHaveLength(1);
    expect(result.repositories[0].features[0].sessions).toEqual([]);
  });

  it('excludes archived sessions by default and counts them', async () => {
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('kept'), session('gone')] },
    });
    vi.mocked(archived.listAllArchivedIds).mockResolvedValue(
      new Map([['claude-code', new Set(['gone'])]])
    );

    const result = await useCase.execute();

    expect(result.repositories[0].unadoptedSessions.map((s) => s.id)).toEqual(['kept']);
    expect(result.archivedCount).toBe(1);
  });

  it('includes archived sessions when asked, flagged as archived', async () => {
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('gone')] },
    });
    vi.mocked(archived.listAllArchivedIds).mockResolvedValue(
      new Map([['claude-code', new Set(['gone'])]])
    );

    const result = await useCase.execute({ includeArchived: true });

    expect(result.repositories[0].unadoptedSessions).toHaveLength(1);
    expect(result.repositories[0].unadoptedSessions[0].archived).toBe(true);
  });

  it('scopes archive state per provider', async () => {
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('shared', { agentType: 'cursor' as AgentType })] },
    });
    // 'shared' is archived under claude-code, but this session is a cursor one.
    vi.mocked(archived.listAllArchivedIds).mockResolvedValue(
      new Map([['claude-code', new Set(['shared'])]])
    );

    const result = await useCase.execute();

    expect(result.repositories[0].unadoptedSessions).toHaveLength(1);
    expect(result.archivedCount).toBe(0);
  });

  it('does not nest a session under a feature from a different repository', async () => {
    vi.mocked(listFeatures.execute).mockResolvedValue([
      feature({ id: 'feat-other', repositoryPath: '/code/elsewhere', sourceAgentSessionId: 's1' }),
    ]);
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('s1')] },
    });

    const result = await useCase.execute();

    expect(result.repositories[0].features).toEqual([]);
    expect(result.repositories[0].unadoptedSessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('exposes filePath so the delete confirmation can name the transcript', async () => {
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('s1')] },
    });

    const result = await useCase.execute();

    expect(result.repositories[0].unadoptedSessions[0].filePath).toBe('/transcripts/s1.jsonl');
  });

  it('handles a repository with no sessions at all', async () => {
    const result = await useCase.execute();

    expect(result.repositories[0].sessionCount).toBe(0);
    expect(result.repositories[0].unadoptedSessions).toEqual([]);
  });

  it('skips repositories with no path', async () => {
    vi.mocked(listRepositories.execute).mockResolvedValue([repo({ path: '' })]);

    const result = await useCase.execute();

    expect(result.repositories).toEqual([]);
  });

  it('does not query the feature repository per session', async () => {
    vi.mocked(listFeatures.execute).mockResolvedValue([
      feature({ id: 'feat-1', sourceAgentSessionId: 's1' }),
    ]);
    vi.mocked(listSessions.execute).mockResolvedValue({
      sessionsByPath: { [REPO_PATH]: [session('s1'), session('s2'), session('s3')] },
    });

    await useCase.execute();

    // One features query total, regardless of session count.
    expect(listFeatures.execute).toHaveBeenCalledTimes(1);
  });
});
