/**
 * Stub Gateway Client
 *
 * Returns deterministic fake responses for E2E tests where no real
 * Commands.com Gateway is available. Activated via SHEP_MOCK_GATEWAY=1.
 */

import type {
  IGatewayClient,
  FetchTokenInput,
  GatewayOAuthToken,
  CreateIntegrationRouteInput,
  GatewayIntegrationRoute,
} from '../../../application/ports/output/services/gateway-client.interface.js';

export class StubGatewayClient implements IGatewayClient {
  async fetchAccessToken(_input: FetchTokenInput): Promise<GatewayOAuthToken> {
    return {
      accessToken: 'stub-access-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  async createIntegrationRoute(
    gatewayUrl: string,
    _accessToken: string,
    input: CreateIntegrationRouteInput
  ): Promise<GatewayIntegrationRoute> {
    const routeId = `stub-route-${input.interfaceType}`;
    const routeToken = `stub-token-${Date.now()}`;
    return {
      routeId,
      routeToken,
      publicUrl: `${gatewayUrl}/integrations/${routeId}/${routeToken}`,
      deviceId: input.deviceId,
      interfaceType: input.interfaceType,
    };
  }
}
