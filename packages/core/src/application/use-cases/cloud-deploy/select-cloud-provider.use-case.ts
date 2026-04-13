import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { CloudDeploymentProvider } from '../../../domain/generated/output.js';

export class ApplicationNotFoundError extends Error {
  readonly code = 'APPLICATION_NOT_FOUND';
  constructor(public readonly applicationId: string) {
    super(`Application ${applicationId} not found`);
  }
}

export interface SelectCloudProviderInput {
  applicationId: string;
  provider: CloudDeploymentProvider;
}

@injectable()
export class SelectCloudProviderUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository
  ) {}

  async execute(input: SelectCloudProviderInput): Promise<void> {
    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) throw new ApplicationNotFoundError(input.applicationId);
    await this.applicationRepo.update(input.applicationId, {
      cloudDeploymentProvider: input.provider,
    });
  }
}
