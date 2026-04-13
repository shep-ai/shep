import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { CloudDeploymentProvider } from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

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
