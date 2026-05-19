/**
 * Check Bedrock Health Use Case
 *
 * Thin presentation-agnostic passthrough over the bedrock prerequisite probe.
 * Presentation layers (CLI table, web banner) own all rendering — this use
 * case never transforms the typed health report.
 */

import { injectable, inject } from 'tsyringe';

import type { BedrockHealth } from '../../../domain/generated/output.js';
import type { IBedrockIntegrationService } from '../../ports/output/services/bedrock-integration.service.js';

@injectable()
export class CheckBedrockHealthUseCase {
  constructor(
    @inject('IBedrockIntegrationService')
    private readonly bedrock: IBedrockIntegrationService
  ) {}

  async execute(): Promise<BedrockHealth> {
    return this.bedrock.doctor();
  }
}
