/**
 * CloudDeploymentProviderRegistry
 *
 * Resolves ICloudDeploymentProvider instances from the tsyringe container
 * using a per-provider string token. Mirrors the
 * AgentSessionRepositoryRegistry pattern already in container.ts.
 *
 * String-token format: `ICloudDeploymentProvider:${providerId}`.
 */

import { injectable } from 'tsyringe';
import { container } from 'tsyringe';

import type {
  CloudDeploymentProviderDescriptor,
  ICloudDeploymentProviderRegistry,
} from '../../../application/ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ICloudDeploymentProvider } from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import { CloudDeploymentProvider } from '../../../domain/generated/output.js';

export const CLOUD_DEPLOYMENT_PROVIDER_TOKEN = (provider: CloudDeploymentProvider): string =>
  `ICloudDeploymentProvider:${provider}`;

@injectable()
export class CloudDeploymentProviderRegistry implements ICloudDeploymentProviderRegistry {
  listAll(): CloudDeploymentProviderDescriptor[] {
    return Object.values(CloudDeploymentProvider).map((id) => {
      const instance = this.tryGet(id);
      return {
        id,
        displayName: instance?.displayName ?? id,
        enabled: instance?.enabled ?? false,
      };
    });
  }

  get(id: CloudDeploymentProvider): ICloudDeploymentProvider {
    const instance = this.tryGet(id);
    if (!instance) {
      throw new Error(
        `No cloud deployment provider registered for id ${id}. Check container bindings.`
      );
    }
    return instance;
  }

  private tryGet(id: CloudDeploymentProvider): ICloudDeploymentProvider | null {
    const token = CLOUD_DEPLOYMENT_PROVIDER_TOKEN(id);
    if (!container.isRegistered(token)) return null;
    return container.resolve<ICloudDeploymentProvider>(token);
  }
}
