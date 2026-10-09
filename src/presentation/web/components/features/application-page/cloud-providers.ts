/**
 * Shared cloud-provider presentation data for the Deploy surfaces
 * (DeployButton, DeployPanel, SmartDeployCluster, ConnectProviderModal).
 *
 * The records are total over CloudDeploymentProvider, so adding a provider
 * to the TypeSpec enum is a compile error here until it has a label.
 */

import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';

/** One row of GET /api/cloud-providers. */
export interface CloudProviderListEntry {
  id: CloudDeploymentProvider;
  displayName: string;
  connected: boolean;
}

/** Full provider names, used before /api/cloud-providers has answered. */
export const CLOUD_PROVIDER_DISPLAY_NAMES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'Cloudflare Pages',
};
