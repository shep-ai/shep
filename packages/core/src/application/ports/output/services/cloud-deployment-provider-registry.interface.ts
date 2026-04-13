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
  enabled: boolean;
}

export interface ICloudDeploymentProviderRegistry {
  /**
   * Return a descriptor for every provider known to the system — both live
   * and disabled stubs. Used by the UI dropdown + ListCloudProvidersUseCase.
   */
  listAll(): CloudDeploymentProviderDescriptor[];

  /**
   * Return the concrete provider instance for the given id.
   * Throws if the id is unknown. Disabled providers may be returned by this
   * method; callers that want to enforce enabled-only should check the
   * `enabled` flag before calling deploy()/validateToken().
   */
  get(id: CloudDeploymentProvider): ICloudDeploymentProvider;
}
