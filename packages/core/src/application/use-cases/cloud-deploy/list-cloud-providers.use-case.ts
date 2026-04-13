import { inject, injectable } from 'tsyringe';

import type { ICloudProviderTokensRepository } from '../../ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { CloudDeploymentProvider } from '../../../domain/generated/output.js';

export interface ListedCloudProvider {
  id: CloudDeploymentProvider;
  displayName: string;
  enabled: boolean;
  connected: boolean;
}

@injectable()
export class ListCloudProvidersUseCase {
  constructor(
    @inject('ICloudDeploymentProviderRegistry')
    private readonly registry: ICloudDeploymentProviderRegistry,
    @inject('ICloudProviderTokensRepository')
    private readonly tokens: ICloudProviderTokensRepository
  ) {}

  async execute(): Promise<ListedCloudProvider[]> {
    const descriptors = this.registry.listAll();
    const connectedSet = new Set(await this.tokens.listConnected());
    return descriptors.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      enabled: d.enabled,
      connected: connectedSet.has(d.id),
    }));
  }
}
