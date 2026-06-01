/**
 * Get GitHub Integration Status Use Case
 *
 * Returns the current GitHub integration status (connected/disconnected)
 * via IGithubIntegrationRepository.
 */
import { inject, injectable } from 'tsyringe';

import type {
  GithubIntegrationStatus,
  IGithubIntegrationRepository,
} from '../../ports/output/repositories/github-integration.repository.interface.js';

@injectable()
export class GetGithubIntegrationStatusUseCase {
  constructor(
    @inject('IGithubIntegrationRepository')
    private readonly repo: IGithubIntegrationRepository
  ) {}

  async execute(): Promise<GithubIntegrationStatus> {
    return this.repo.getStatus();
  }
}
