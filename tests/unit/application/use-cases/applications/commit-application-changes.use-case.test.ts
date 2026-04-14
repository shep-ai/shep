import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommitApplicationChangesUseCase } from '@/application/use-cases/applications/commit-application-changes.use-case.js';
import { CommitAndPushApplicationChangesUseCase } from '@/application/use-cases/applications/commit-and-push-application-changes.use-case.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';
import { ApplicationStatus, type Application } from '@/domain/generated/output.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IGitCommitService } from '@/application/ports/output/services/git-commit.service.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';

class FakeAppRepo implements IApplicationRepository {
  private apps = new Map<string, Application>();
  async create(a: Application) {
    this.apps.set(a.id, { ...a });
  }
  async findById(id: string) {
    return this.apps.get(id) ?? null;
  }
  async findBySlug() {
    return null;
  }
  async findByPath() {
    return null;
  }
  async list() {
    return [...this.apps.values()];
  }
  async update(id: string, fields: Partial<Application>) {
    const app = this.apps.get(id);
    if (!app) return;
    this.apps.set(id, { ...app, ...fields });
  }
  async softDelete(id: string) {
    this.apps.delete(id);
  }
  async restore(): Promise<void> {
    /* no-op */
  }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    name: 'App',
    slug: 'app-slug',
    description: 'desc',
    repositoryPath: '/repo',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function silentLogger(): ILogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

describe('CommitApplicationChangesUseCase', () => {
  let repo: FakeAppRepo;
  let commit: IGitCommitService;
  let useCase: CommitApplicationChangesUseCase;

  beforeEach(async () => {
    repo = new FakeAppRepo();
    await repo.create(makeApp());
    commit = {
      commitChanges: vi.fn().mockResolvedValue({ committed: true }),
      commitAndPush: vi.fn().mockResolvedValue({ committed: true, pushed: true }),
    };
    useCase = new CommitApplicationChangesUseCase(repo, commit, silentLogger());
  });

  it('commits staged changes via the git commit service', async () => {
    const result = await useCase.execute({
      applicationId: 'app-1',
      message: 'chore: update',
    });
    expect(result.committed).toBe(true);
    expect(commit.commitChanges).toHaveBeenCalledWith({
      cwd: '/repo',
      message: 'chore: update',
    });
  });

  it('throws ApplicationNotFoundError for unknown application ids', async () => {
    await expect(
      useCase.execute({ applicationId: 'missing', message: 'x' })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });

  it('rejects empty commit messages', async () => {
    await expect(useCase.execute({ applicationId: 'app-1', message: '   ' })).rejects.toThrow(
      /commit message is required/i
    );
  });

  it('propagates committed=false when the working tree was clean', async () => {
    (commit.commitChanges as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      committed: false,
    });
    const result = await useCase.execute({
      applicationId: 'app-1',
      message: 'chore: update',
    });
    expect(result.committed).toBe(false);
  });
});

describe('CommitAndPushApplicationChangesUseCase', () => {
  let repo: FakeAppRepo;
  let commit: IGitCommitService;
  let useCase: CommitAndPushApplicationChangesUseCase;

  beforeEach(async () => {
    repo = new FakeAppRepo();
    await repo.create(makeApp());
    commit = {
      commitChanges: vi.fn().mockResolvedValue({ committed: true }),
      commitAndPush: vi.fn().mockResolvedValue({ committed: true, pushed: true }),
    };
    useCase = new CommitAndPushApplicationChangesUseCase(repo, commit, silentLogger());
  });

  it('commits and pushes via the git commit service', async () => {
    const result = await useCase.execute({
      applicationId: 'app-1',
      message: 'chore: update',
    });
    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(commit.commitAndPush).toHaveBeenCalledWith({
      cwd: '/repo',
      message: 'chore: update',
    });
  });

  it('throws ApplicationNotFoundError for unknown application ids', async () => {
    await expect(
      useCase.execute({ applicationId: 'missing', message: 'x' })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });

  it('rejects empty commit messages', async () => {
    await expect(useCase.execute({ applicationId: 'app-1', message: '' })).rejects.toThrow(
      /commit message is required/i
    );
  });
});
