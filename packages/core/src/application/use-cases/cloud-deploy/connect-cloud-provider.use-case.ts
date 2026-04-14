import { inject, injectable } from 'tsyringe';

import type { ICloudProviderTokensRepository } from '../../ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../ports/output/services/cloud-deployment-provider-registry.interface.js';
import { ProviderNotImplementedError } from '../../../domain/errors/provider-not-implemented.error.js';
import type { CloudDeploymentProvider } from '../../../domain/generated/output.js';

export interface ConnectCloudProviderInput {
  provider: CloudDeploymentProvider;
  token: string;
}

@injectable()
export class ConnectCloudProviderUseCase {
  constructor(
    @inject('ICloudDeploymentProviderRegistry')
    private readonly registry: ICloudDeploymentProviderRegistry,
    @inject('ICloudProviderTokensRepository')
    private readonly tokens: ICloudProviderTokensRepository
  ) {}

  async execute(input: ConnectCloudProviderInput): Promise<void> {
    const provider = this.registry.get(input.provider);
    if (!provider.enabled) {
      throw new ProviderNotImplementedError(input.provider);
    }
    // Throws if the token is invalid — we do NOT persist on failure.
    await provider.validateToken(input.token);
    await this.tokens.set(input.provider, input.token);
  }
}
