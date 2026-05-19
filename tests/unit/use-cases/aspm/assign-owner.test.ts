/**
 * AssignOwnerUseCase tests (feature 098, phase 2).
 *
 * Assigns an Owner as the UI-declared override on a target asset
 * (Application | Service | ApiAsset | CloudEnvironment).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IOwnerRepository } from '@/application/ports/output/repositories/owner-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IServiceRepository } from '@/application/ports/output/repositories/service-repository.interface.js';
import type { IApiAssetRepository } from '@/application/ports/output/repositories/api-asset-repository.interface.js';
import type { ICloudEnvironmentRepository } from '@/application/ports/output/repositories/cloud-environment-repository.interface.js';
import { AssignOwnerUseCase } from '@/application/use-cases/aspm/ownership/assign-owner.js';
import { AssetType } from '@/domain/generated/output.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';

function makeMocks() {
  const ownerRepo: IOwnerRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByHandle: vi.fn(),
    listAll: vi.fn(),
    listByTeam: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const appRepo = {
    findById: vi.fn(),
    update: vi.fn(),
  } as unknown as IApplicationRepository;
  const serviceRepo: IServiceRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByApplicationId: vi.fn(),
    listAll: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const apiRepo: IApiAssetRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByApplicationId: vi.fn(),
    listAll: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const envRepo: ICloudEnvironmentRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByApplicationId: vi.fn(),
    listAll: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  return { ownerRepo, appRepo, serviceRepo, apiRepo, envRepo };
}

describe('AssignOwnerUseCase', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let uc: AssignOwnerUseCase;

  beforeEach(() => {
    mocks = makeMocks();
    uc = new AssignOwnerUseCase(
      mocks.ownerRepo,
      mocks.appRepo,
      mocks.serviceRepo,
      mocks.apiRepo,
      mocks.envRepo
    );
    (mocks.ownerRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'owner-1',
    });
    (mocks.appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'app-1' });
    (mocks.serviceRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'svc-1' });
    (mocks.apiRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'api-1' });
    (mocks.envRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'env-1' });
  });

  it('assigns owner to a Service asset', async () => {
    await uc.execute({ assetType: AssetType.Service, assetId: 'svc-1', ownerId: 'owner-1' });
    expect(mocks.serviceRepo.update).toHaveBeenCalledWith('svc-1', { ownerId: 'owner-1' });
  });

  it('assigns owner to an ApiAsset', async () => {
    await uc.execute({ assetType: AssetType.ApiAsset, assetId: 'api-1', ownerId: 'owner-1' });
    expect(mocks.apiRepo.update).toHaveBeenCalledWith('api-1', { ownerId: 'owner-1' });
  });

  it('assigns owner to a CloudEnvironment', async () => {
    await uc.execute({
      assetType: AssetType.CloudEnvironment,
      assetId: 'env-1',
      ownerId: 'owner-1',
    });
    expect(mocks.envRepo.update).toHaveBeenCalledWith('env-1', { ownerId: 'owner-1' });
  });

  it('throws when the owner does not exist', async () => {
    (mocks.ownerRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      uc.execute({ assetType: AssetType.Service, assetId: 'svc-1', ownerId: 'unknown' })
    ).rejects.toThrow();
  });

  it('throws ApplicationNotFoundError when the application asset is missing', async () => {
    (mocks.appRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      uc.execute({ assetType: AssetType.Application, assetId: 'app-x', ownerId: 'owner-1' })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });
});
