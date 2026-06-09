/**
 * Gateway Client Interface
 *
 * Output port for the Commands.com Gateway HTTP API. Implementations handle
 * authentication (OAuth demo/OIDC) and integration-route provisioning so the
 * MessagingService can receive inbound webhooks from Telegram/WhatsApp.
 *
 * Reference: https://github.com/Commands-com/gateway/blob/main/docs/openapi.yaml
 */

export interface GatewayOAuthToken {
  accessToken: string;
  tokenType: string;
  /** Absolute expiry time in ms since epoch. */
  expiresAt: number;
  refreshToken?: string;
}

export interface GatewayIntegrationRoute {
  routeId: string;
  routeToken: string;
  publicUrl: string;
  deviceId: string;
  interfaceType: string;
}

export interface CreateIntegrationRouteInput {
  deviceId: string;
  interfaceType: string;
  /** Optional client-provided token override. Gateway issues one if omitted. */
  routeToken?: string;
  tokenMaxAgeDays?: number;
  maxBodyBytes?: number;
  deadlineMs?: number;
}

export interface FetchTokenInput {
  gatewayUrl: string;
  clientId: string;
  /** For demo auth the client secret is optional. */
  clientSecret?: string;
  scope?: string;
}

/**
 * Port for interacting with the Commands.com Gateway HTTP API.
 *
 * Implementations MUST NOT leak HTTP specifics (status codes, headers) to
 * the application layer — return domain objects or throw domain errors.
 */
export interface IGatewayClient {
  /**
   * Fetch (or refresh) an OAuth access token for the configured client.
   * Uses the client_credentials grant in demo mode.
   */
  fetchAccessToken(input: FetchTokenInput): Promise<GatewayOAuthToken>;

  /**
   * Register a new integration route on the gateway. The returned `publicUrl`
   * is what the messaging platform (Telegram webhook, etc.) should POST to.
   */
  createIntegrationRoute(
    gatewayUrl: string,
    accessToken: string,
    input: CreateIntegrationRouteInput
  ): Promise<GatewayIntegrationRoute>;
}
