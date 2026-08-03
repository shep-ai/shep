/**
 * ImportLocalRepositoriesUseCase Unit Tests
 *
 * TDD Phase: RED — written before the use case exists.
 *
 * Spec 105 success criterion: bulk import returns a PER-PATH result so partial
 * failures are visible rather than silent, and one bad path must not abort the
 * rest of the batch.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportLocalRepositoriesUseCase } from '@/application/use-cases/repositories/import-local-repositories.use-case.js';
import type { AddRepositoryUseCase } from '@/application/use-cases/repositories/add-repository.use-case.js';
import type { Repository } from '@/domain/generated/output.js';

function makeRepository(path: string): Repository {
  return {
    id: `repo-${path}`,
    name: path.split('/').pop() ?? path,
    path,
    bedrockEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('ImportLocalRepositoriesUseCase', () => {
  let addRepository: AddRepositoryUseCase;
  let useCase: ImportLocalRepositoriesUseCase;

  beforeEach(() => {
    addRepository = {
      execute: vi
        .fn()
        .mockImplementation(async ({ path }: { path: string }) => makeRepository(path)),
    } as unknown as AddRepositoryUseCase;

    useCase = new ImportLocalRepositoriesUseCase(addRepository);
  });

  it('imports every requested path via AddRepositoryUseCase', async () => {
    const result = await useCase.execute({ paths: ['/code/a', '/code/b'] });

    expect(addRepository.execute).toHaveBeenCalledTimes(2);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.imported)).toBe(true);
  });

  it('returns one result entry per input path', async () => {
    const result = await useCase.execute({ paths: ['/code/a', '/code/b', '/code/c'] });

    expect(result.results.map((r) => r.path)).toEqual(['/code/a', '/code/b', '/code/c']);
  });

  it('continues importing after one path fails', async () => {
    vi.mocked(addRepository.execute).mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/code/bad') throw new Error('permission denied');
      return makeRepository(path);
    });

    const result = await useCase.execute({ paths: ['/code/a', '/code/bad', '/code/c'] });

    expect(result.results).toHaveLength(3);
    const byPath = new Map(result.results.map((r) => [r.path, r]));
    expect(byPath.get('/code/a')?.imported).toBe(true);
    expect(byPath.get('/code/bad')?.imported).toBe(false);
    expect(byPath.get('/code/bad')?.error).toContain('permission denied');
    expect(byPath.get('/code/c')?.imported).toBe(true);
  });

  it('summarises imported and failed counts', async () => {
    vi.mocked(addRepository.execute).mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/code/bad') throw new Error('nope');
      return makeRepository(path);
    });

    const result = await useCase.execute({ paths: ['/code/a', '/code/bad'] });

    expect(result.importedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('collapses duplicate paths to a single import', async () => {
    const result = await useCase.execute({ paths: ['/code/a', '/code/a'] });

    expect(addRepository.execute).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
  });

  it('treats paths differing only by trailing slash as duplicates', async () => {
    const result = await useCase.execute({ paths: ['/code/a', '/code/a/'] });

    expect(addRepository.execute).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
  });

  it('returns an empty result for an empty selection without error', async () => {
    const result = await useCase.execute({ paths: [] });

    expect(result.results).toEqual([]);
    expect(result.importedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(addRepository.execute).not.toHaveBeenCalled();
  });

  it('exposes the created repository on successful entries', async () => {
    const result = await useCase.execute({ paths: ['/code/a'] });

    expect(result.results[0].repository?.path).toBe('/code/a');
  });

  it('imports Windows drive-letter paths', async () => {
    // CI runs on windows-latest; these are absolute but do not start with "/".
    const result = await useCase.execute({ paths: ['C:\\Users\\dev\\Code\\proj'] });

    expect(result.results[0].imported).toBe(true);
    expect(addRepository.execute).toHaveBeenCalledWith({ path: 'C:/Users/dev/Code/proj' });
  });

  it('rejects relative paths without attempting an import', async () => {
    const result = await useCase.execute({ paths: ['relative/dir'] });

    expect(result.results[0].imported).toBe(false);
    expect(result.results[0].error).toMatch(/absolute/i);
    expect(addRepository.execute).not.toHaveBeenCalled();
  });
});
