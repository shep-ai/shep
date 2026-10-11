/**
 * CloudDeploymentProviderRegistry
 *
 * Resolves ICloudDeploymentProvider instances from the tsyringe container
 * it was registered in, using a per-provider string token. Only ids with a
 * registered adapter are listed.
 *
 * String-token format: `ICloudDeploymentProvider:${providerId}`.
 */

import type { DependencyContainer } from 'tsyringe';

import type {
  CloudDeploymentProviderDescriptor,
  ICloudDeploymentProviderRegistry,
} from '../../../application/ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ICloudDeploymentProvider } from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import { CloudDeploymentProvider } from '../../../domain/generated/output.js';

export const CLOUD_DEPLOYMENT_PROVIDER_TOKEN = (provider: CloudDeploymentProvider): string =>
  `ICloudDeploymentProvider:${provider}`;

export class CloudDeploymentProviderRegistry implements ICloudDeploymentProviderRegistry {
  /** The container holding the per-provider registrations (a child container in tests). */
  constructor(private readonly container: DependencyContainer) {}

  listAll(): CloudDeploymentProviderDescriptor[] {
    return Object.values(CloudDeploymentProvider).flatMap((id) => {
      const instance = this.tryGet(id);
      // An id with no registered adapter cannot deploy, so it is not listed.
      return instance ? [{ id, displayName: instance.displayName }] : [];
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
    if (!this.container.isRegistered(token, true)) return null;
    return this.container.resolve<ICloudDeploymentProvider>(token);
  }
}
