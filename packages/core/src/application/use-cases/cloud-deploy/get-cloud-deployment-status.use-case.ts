import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

export interface CloudDeploymentStatusDto {
  provider?: CloudDeploymentProvider;
  status?: CloudDeploymentStatus;
  deploymentId?: string;
  url?: string;
  error?: string;
  lastDeployedAt?: Date;
  gitRemoteUrl?: string;
}

@injectable()
export class GetCloudDeploymentStatusUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository
  ) {}

  async execute(applicationId: string): Promise<CloudDeploymentStatusDto> {
    const app = await this.applicationRepo.findById(applicationId);
    if (!app) throw new ApplicationNotFoundError(applicationId);
    return {
      provider: app.cloudDeploymentProvider,
      status: app.cloudDeploymentStatus,
      deploymentId: app.cloudDeploymentId,
      url: app.cloudDeploymentUrl,
      error: app.cloudDeploymentError,
      lastDeployedAt:
        app.lastDeployedAt instanceof Date
          ? app.lastDeployedAt
          : app.lastDeployedAt
            ? new Date(app.lastDeployedAt)
            : undefined,
      gitRemoteUrl: app.gitRemoteUrl,
    };
  }
}
