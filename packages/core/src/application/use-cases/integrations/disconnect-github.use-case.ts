/**
 * Disconnect GitHub Use Case
 *
 * Removes the GitHub integration token via IGithubIntegrationRepository.
 */
import { inject, injectable } from 'tsyringe';

import type { IGithubIntegrationRepository } from '../../ports/output/repositories/github-integration.repository.interface.js';

@injectable()
export class DisconnectGithubUseCase {
  constructor(
    @inject('IGithubIntegrationRepository')
    private readonly repo: IGithubIntegrationRepository
  ) {}

  async execute(): Promise<void> {
    await this.repo.remove();
  }
}
