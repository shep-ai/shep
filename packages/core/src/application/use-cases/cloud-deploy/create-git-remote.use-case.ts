import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IGitRemoteService } from '../../ports/output/services/git-remote.service.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

export interface CreateGitRemoteResult {
  remoteUrl: string;
}

@injectable()
export class CreateGitRemoteUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitRemoteService')
    private readonly gitRemoteService: IGitRemoteService
  ) {}

  async execute(applicationId: string): Promise<CreateGitRemoteResult> {
    const app = await this.applicationRepo.findById(applicationId);
    if (!app) throw new ApplicationNotFoundError(applicationId);

    const { remoteUrl } = await this.gitRemoteService.createGitHubRepoAndPush({
      cwd: app.repositoryPath,
      slug: app.slug,
      description: app.description,
    });

    await this.applicationRepo.update(applicationId, { gitRemoteUrl: remoteUrl });
    return { remoteUrl };
  }
}
