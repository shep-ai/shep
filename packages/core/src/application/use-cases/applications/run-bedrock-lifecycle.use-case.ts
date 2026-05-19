/**
 * Run Bedrock Lifecycle Use Case
 *
 * Stateless dispatch over the BedrockLifecycleAction enum. Guards on
 * `bedrockEnabled = true` so a lifecycle command can never run against an
 * application where the user has not opted in.
 */

import { injectable, inject } from 'tsyringe';

import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { BedrockNotEnabledError } from '../../../domain/errors/bedrock-not-enabled.error.js';
import { BedrockLifecycleAction } from '../../../domain/generated/output.js';
import type {
  BedrockLifecycleOptions,
  BedrockLifecycleResult,
  BedrockProgressHandler,
  IBedrockIntegrationService,
} from '../../ports/output/services/bedrock-integration.service.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

export interface RunBedrockLifecycleInput {
  applicationId: string;
  action: BedrockLifecycleAction;
  onProgress?: BedrockProgressHandler;
}

@injectable()
export class RunBedrockLifecycleUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IBedrockIntegrationService')
    private readonly bedrock: IBedrockIntegrationService
  ) {}

  async execute(input: RunBedrockLifecycleInput): Promise<BedrockLifecycleResult> {
    const application = await this.appRepo.findById(input.applicationId);
    if (!application) {
      throw new ApplicationNotFoundError(input.applicationId);
    }
    if (!application.bedrockEnabled) {
      throw new BedrockNotEnabledError(application.id);
    }

    const opts: BedrockLifecycleOptions = {
      cwd: application.repositoryPath,
      onProgress: input.onProgress,
    };

    switch (input.action) {
      case BedrockLifecycleAction.Init:
        return this.bedrock.init(opts);
      case BedrockLifecycleAction.Sync:
        return this.bedrock.sync(opts);
      case BedrockLifecycleAction.Ship:
        return this.bedrock.ship(opts);
      default: {
        const unreachable: never = input.action;
        throw new Error(`Unhandled BedrockLifecycleAction: ${String(unreachable)}`);
      }
    }
  }
}
