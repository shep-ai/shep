import { inject, injectable } from 'tsyringe';

import type { IGitRemoteService } from '../../ports/output/services/git-remote.service.interface.js';

@injectable()
export class EnsureGhAuthenticatedUseCase {
  constructor(
    @inject('IGitRemoteService')
    private readonly gitRemoteService: IGitRemoteService
  ) {}

  async execute(): Promise<{ authenticated: boolean }> {
    const authenticated = await this.gitRemoteService.isGhAuthenticated();
    return { authenticated };
  }
}
