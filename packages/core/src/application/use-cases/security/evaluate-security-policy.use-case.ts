/**
 * Evaluate Security Policy Use Case
 *
 * Wraps ISecurityPolicyService.evaluatePolicy() as a use case.
 * Updates settings with the latest evaluation timestamp and policy source.
 * Returns the effective policy snapshot.
 */

import { injectable, inject } from 'tsyringe';
import { SecurityMode } from '../../../domain/generated/output.js';
import type { EffectivePolicySnapshot } from '../../../domain/generated/output.js';
import type { ISecurityPolicyService } from '../../ports/output/services/security-policy-service.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

/**
 * Input for the evaluate security policy use case.
 */
export interface EvaluateSecurityPolicyInput {
  /** Absolute path to the repository to evaluate */
  repositoryPath: string;
}

@injectable()
export class EvaluateSecurityPolicyUseCase {
  constructor(
    @inject('ISecurityPolicyService')
    private readonly policyService: ISecurityPolicyService,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: EvaluateSecurityPolicyInput): Promise<EffectivePolicySnapshot> {
    const policy = await this.policyService.evaluatePolicy(input.repositoryPath);

    // Update settings with evaluation timestamp and source
    try {
      const settings = await this.settingsRepository.load();
      if (settings) {
        settings.security = {
          ...settings.security,
          mode: settings.security?.mode ?? SecurityMode.Advisory,
          lastEvaluationAt: new Date().toISOString(),
          policySource: policy.source,
        };
        await this.settingsRepository.update(settings);
      }
    } catch {
      // Non-fatal — policy is still returned even if settings update fails
    }

    return policy;
  }
}
