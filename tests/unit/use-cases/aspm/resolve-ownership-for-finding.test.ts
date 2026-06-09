/**
 * ResolveOwnershipForFindingUseCase tests (feature 098, phase 2).
 *
 * Application-layer wrapper around the pure-domain resolveOwnership
 * function. Loads the Application (for the application owner fallback)
 * and the .shep/ownership.yaml (via IOwnershipYamlReader), then asks the
 * resolver to compute the effective Owner.
 *
 * Throws OwnerOrphanedFindingError if no owner can be resolved — the
 * caller (a find-by-id Finding flow) gets a typed error instead of a
 * silent null.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IOwnerRepository } from '@/application/ports/output/repositories/owner-repository.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';
import { ResolveOwnershipForFindingUseCase } from '@/application/use-cases/aspm/ownership/resolve-ownership-for-finding.js';
import { OwnerOrphanedFindingError } from '@/domain/aspm/errors/owner-orphaned-finding.error.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';

describe('ResolveOwnershipForFindingUseCase', () => {
  let appRepo: IApplicationRepository;
  let ownerRepo: IOwnerRepository;
  let reader: IOwnershipYamlReader;
  let uc: ResolveOwnershipForFindingUseCase;

  beforeEach(() => {
    appRepo = { findById: vi.fn() } as unknown as IApplicationRepository;
    ownerRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByHandle: vi.fn(),
      listAll: vi.fn(),
      listByTeam: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    reader = { read: vi.fn() };
    uc = new ResolveOwnershipForFindingUseCase(appRepo, ownerRepo, reader);
  });

  it('returns the YAML-matched owner when a path glob matches', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ pathGlob: 'src/api/**', ownerId: 'o-api', source: 'yaml' }],
    });
    (ownerRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'o-api' });

    const result = await uc.execute({ applicationId: 'app-1', assetPath: 'src/api/users.ts' });
    expect(result.ownerId).toBe('o-api');
    expect(result.source).toBe('yaml');
    expect(ownerRepo.findById).toHaveBeenCalledWith('o-api');
  });

  it('prefers UI override when provided', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ pathGlob: 'src/**', ownerId: 'yaml-owner', source: 'yaml' }],
    });
    (ownerRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ui-owner' });

    const result = await uc.execute({
      applicationId: 'app-1',
      assetPath: 'src/index.ts',
      uiOverrideOwnerId: 'ui-owner',
    });
    expect(result.ownerId).toBe('ui-owner');
    expect(result.source).toBe('ui');
  });

  it('throws OwnerOrphanedFindingError when no resolution is possible', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({ entries: [] });

    await expect(
      uc.execute({ applicationId: 'app-1', assetPath: 'nowhere.ts' })
    ).rejects.toBeInstanceOf(OwnerOrphanedFindingError);
  });

  it('throws ApplicationNotFoundError when the application does not exist', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      uc.execute({ applicationId: 'missing', assetPath: 'x.ts' })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });

  it('throws OwnerOrphanedFindingError when the resolved owner does not exist', async () => {
    (appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'app-1',
      repositoryPath: '/repos/app-1',
    });
    (reader.read as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ pathGlob: 'src/**', ownerId: 'ghost-owner', source: 'yaml' }],
    });
    (ownerRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      uc.execute({ applicationId: 'app-1', assetPath: 'src/x.ts' })
    ).rejects.toBeInstanceOf(OwnerOrphanedFindingError);
  });
});
