/**
 * ImportOwnershipYamlUseCase tests (feature 098, phase 2).
 *
 * Reads .shep/ownership.yaml from an Application's repository via
 * IOwnershipYamlReader. The use case does not create Owner/Team/BU rows
 * — the YAML refers to existing ids by UUID. It returns the parsed
 * document plus a count of valid entries so the caller can surface
 * a "N ownership rules imported" UX message.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';
import { ImportOwnershipYamlUseCase } from '@/application/use-cases/aspm/ownership/import-ownership-yaml.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';

describe('ImportOwnershipYamlUseCase', () => {
  let appRepo: IApplicationRepository;
  let reader: IOwnershipYamlReader;
  let uc: ImportOwnershipYamlUseCase;

  beforeEach(() => {
    appRepo = { findById: vi.fn() } as unknown as IApplicationRepository;
    reader = { read: vi.fn() };
    uc = new ImportOwnershipYamlUseCase(appRepo, reader);
  });

  it('reads the YAML from the application repository path and returns count + entries', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [
        { pathGlob: 'src/api/**', ownerId: 'o-api', source: 'yaml' },
        { pathGlob: 'src/web/**', ownerId: 'o-web', source: 'yaml' },
      ],
    });

    const result = await uc.execute({ applicationId: 'app-1' });
    expect(reader.read).toHaveBeenCalledWith('/repos/app-1');
    expect(result.count).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.pathGlob).toBe('src/api/**');
  });

  it('returns zero entries when the file is missing', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({ entries: [] });

    const result = await uc.execute({ applicationId: 'app-1' });
    expect(result.count).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it('throws ApplicationNotFoundError when the application does not exist', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(uc.execute({ applicationId: 'missing' })).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    );
  });
});
