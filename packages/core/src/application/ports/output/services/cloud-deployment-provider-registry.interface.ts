/**
 * Cloud Deployment Provider Registry (port)
 *
 * Central lookup for all registered ICloudDeploymentProvider implementations.
 * Mirrors the AgentSessionRepositoryRegistry pattern: one string token per
 * provider id, plus a single registry service that resolves them from the
 * tsyringe container at runtime.
 */

import type { CloudDeploymentProvider } from '../../../../domain/generated/output.js';
import type { ICloudDeploymentProvider } from './cloud-deployment-provider.interface.js';

export interface CloudDeploymentProviderDescriptor {
  id: CloudDeploymentProvider;
  displayName: string;
}

export interface ICloudDeploymentProviderRegistry {
  /**
   * Return a descriptor for every provider that has a registered adapter.
   * Used by the UI provider list + ListCloudProvidersUseCase.
   */
  listAll(): CloudDeploymentProviderDescriptor[];

  /**
   * Return the concrete provider instance for the given id.
   * Throws if no adapter is registered for the id.
   */
  get(id: CloudDeploymentProvider): ICloudDeploymentProvider;
}
