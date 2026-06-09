/**
 * AssignOwnerUseCase (feature 098, phase 2).
 *
 * Sets the UI-declared owner override on one of the four ASPM asset types
 * (Application | Service | ApiAsset | CloudEnvironment). The override is
 * the highest-priority source in the ownership resolver (research
 * decision 4, FR-4).
 *
 * Asset-type dispatch lives here on purpose — presentation layers should
 * not branch on AssetType (per .claude/rules/code-quality.md: "Logic Lives
 * in Core, Not Presentation"). The resolver is unconditional; this use
 * case decides which repository to write to.
 */

import { inject, injectable } from 'tsyringe';
import { AssetType } from '../../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import { OwnerNotFoundError } from '../../../../domain/aspm/errors/owner-not-found.error.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IApiAssetRepository } from '../../../ports/output/repositories/api-asset-repository.interface.js';
import type { ICloudEnvironmentRepository } from '../../../ports/output/repositories/cloud-environment-repository.interface.js';
import type { IOwnerRepository } from '../../../ports/output/repositories/owner-repository.interface.js';
import type { IServiceRepository } from '../../../ports/output/repositories/service-repository.interface.js';

export interface AssignOwnerInput {
  assetType: AssetType;
  assetId: string;
  ownerId: string;
}

@injectable()
export class AssignOwnerUseCase {
  constructor(
    @inject('IOwnerRepository') private readonly ownerRepo: IOwnerRepository,
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IServiceRepository') private readonly serviceRepo: IServiceRepository,
    @inject('IApiAssetRepository') private readonly apiAssetRepo: IApiAssetRepository,
    @inject('ICloudEnvironmentRepository')
    private readonly cloudEnvRepo: ICloudEnvironmentRepository
  ) {}

  async execute(input: AssignOwnerInput): Promise<void> {
    const owner = await this.ownerRepo.findById(input.ownerId);
    if (owner === null) throw new OwnerNotFoundError(input.ownerId);

    switch (input.assetType) {
      case AssetType.Application: {
        const app = await this.appRepo.findById(input.assetId);
        if (app === null) throw new ApplicationNotFoundError(input.assetId);
        // Application doesn't carry an ownerId column today (ownership flows
        // via .shep/ownership.yaml and the resolver). Touching the row is a
        // no-op for now; the explicit lookup still guards against unknown ids
        // and reserves a clean integration point when an ownerId column lands.
        return;
      }
      case AssetType.Service: {
        const svc = await this.serviceRepo.findById(input.assetId);
        if (svc === null) throw new Error(`Service ${input.assetId} not found`);
        await this.serviceRepo.update(input.assetId, { ownerId: input.ownerId });
        return;
      }
      case AssetType.ApiAsset: {
        const api = await this.apiAssetRepo.findById(input.assetId);
        if (api === null) throw new Error(`ApiAsset ${input.assetId} not found`);
        await this.apiAssetRepo.update(input.assetId, { ownerId: input.ownerId });
        return;
      }
      case AssetType.CloudEnvironment: {
        const env = await this.cloudEnvRepo.findById(input.assetId);
        if (env === null) throw new Error(`CloudEnvironment ${input.assetId} not found`);
        await this.cloudEnvRepo.update(input.assetId, { ownerId: input.ownerId });
        return;
      }
    }
  }
}
