/**
 * Enable Bedrock For Application Use Case
 *
 * Persists `bedrockEnabled = true` on the target application (if not already
 * enabled) and runs `bedrock init` inside the application's worktree.
 *
 * Idempotency contract: re-running on an already-enabled application skips
 * the persistence write but still invokes `init` so callers can recover from
 * partial state (e.g. flag set but `.bedrock/` missing on disk).
 */

import { injectable, inject } from 'tsyringe';

import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import type {
  BedrockLifecycleResult,
  BedrockProgressHandler,
  IBedrockIntegrationService,
} from '../../ports/output/services/bedrock-integration.service.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

export interface EnableBedrockInput {
  applicationId: string;
  onProgress?: BedrockProgressHandler;
}

@injectable()
export class EnableBedrockForApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IBedrockIntegrationService')
    private readonly bedrock: IBedrockIntegrationService
  ) {}

  async execute(input: EnableBedrockInput): Promise<BedrockLifecycleResult> {
    const application = await this.appRepo.findById(input.applicationId);
    if (!application) {
      throw new ApplicationNotFoundError(input.applicationId);
    }

    if (!application.bedrockEnabled) {
      await this.appRepo.update(application.id, { bedrockEnabled: true });
    }

    return this.bedrock.init({
      cwd: application.repositoryPath,
      onProgress: input.onProgress,
    });
  }
}
