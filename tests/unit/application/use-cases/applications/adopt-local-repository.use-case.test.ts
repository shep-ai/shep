import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ApplicationStatus, type Application } from '@/domain/generated/output.js';
import { AdoptLocalRepositoryUseCase } from '@/application/use-cases/applications/adopt-local-repository.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';

function repository(existing: Application | null = null) {
  return {
    findByPath: vi.fn(async () => existing),
    create: vi.fn(async () => undefined),
  } as unknown as IApplicationRepository & {
    findByPath: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
}

describe('AdoptLocalRepositoryUseCase', () => {
  it('registers an existing folder as a ready application named after it', async () => {
    const repo = repository();
    const result = await new AdoptLocalRepositoryUseCase(repo).execute('C:\\work\\pay-api');
    if (!result.ok) throw new Error(result.error);
    expect(result.adopted).toBe(true);
    expect(result.application).toMatchObject({
      name: 'Pay Api',
      slug: 'pay-api',
      repositoryPath: 'C:/work/pay-api',
      status: ApplicationStatus.Idle,
      setupComplete: true,
    });
    expect(repo.findByPath).toHaveBeenCalledWith('C:/work/pay-api');
    expect(repo.create).toHaveBeenCalledWith(result.application);
  });

  it('returns the application already at that path', async () => {
    const existing = { id: 'app-1', repositoryPath: '/work/pay-api' } as Application;
    const repo = repository(existing);
    const result = await new AdoptLocalRepositoryUseCase(repo).execute('/work/pay-api/');
    expect(result).toEqual({ ok: true, application: existing, adopted: false });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('refuses a path without a folder name', async () => {
    expect((await new AdoptLocalRepositoryUseCase(repository()).execute('/')).ok).toBe(false);
  });
});
