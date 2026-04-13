/**
 * Cloud Provider Tokens Repository (port)
 *
 * Stores per-cloud-provider API tokens encrypted-at-rest using LocalSecretBox.
 * Used by ConnectCloudProviderUseCase + ICloudDeploymentProvider adapters.
 *
 * Spec 089 — one-click-cloud-deploy.
 */

import type { CloudDeploymentProvider } from '../../../../domain/generated/output.js';

export interface ICloudProviderTokensRepository {
  /**
   * Return the decrypted token for the provider, or null if no token is stored.
   */
  get(provider: CloudDeploymentProvider): Promise<string | null>;

  /**
   * Store (or replace) the token for the provider. Token is encrypted before
   * the row is written.
   */
  set(provider: CloudDeploymentProvider, token: string): Promise<void>;

  /**
   * Remove any stored token for the provider. No-op if none exists.
   */
  remove(provider: CloudDeploymentProvider): Promise<void>;

  /**
   * Return the list of providers that currently have a token stored.
   */
  listConnected(): Promise<CloudDeploymentProvider[]>;
}
