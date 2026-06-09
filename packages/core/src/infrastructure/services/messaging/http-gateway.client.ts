/**
 * HTTP Gateway Client
 *
 * Concrete implementation of IGatewayClient that speaks the Commands.com
 * Gateway OpenAPI (see https://github.com/Commands-com/gateway/blob/main/docs/openapi.yaml).
 *
 * This adapter is infrastructure — it knows about HTTP verbs, status codes,
 * and the gateway's wire format. Callers receive domain objects only.
 */

import { injectable } from 'tsyringe';
import type {
  IGatewayClient,
  FetchTokenInput,
  GatewayOAuthToken,
  CreateIntegrationRouteInput,
  GatewayIntegrationRoute,
} from '../../../application/ports/output/services/gateway-client.interface.js';

type FetchFn = typeof fetch;

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = (await response.json()) as { error?: unknown; message?: unknown };
      const err = typeof json.error === 'string' ? json.error : undefined;
      const msg = typeof json.message === 'string' ? json.message : undefined;
      return err ?? msg ?? JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return '';
  }
}

@injectable()
export class HttpGatewayClient implements IGatewayClient {
  constructor(private readonly fetchImpl: FetchFn = fetch) {}

  async fetchAccessToken(input: FetchTokenInput): Promise<GatewayOAuthToken> {
    const base = stripTrailingSlash(input.gatewayUrl);
    const url = `${base}/oauth/token`;

    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('client_id', input.clientId);
    if (input.clientSecret) {
      params.set('client_secret', input.clientSecret);
    }
    if (input.scope) {
      params.set('scope', input.scope);
    }

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const detail = await readErrorBody(response);
      throw new Error(
        `Gateway /oauth/token failed with ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }

    const body = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!body.access_token) {
      throw new Error('Gateway /oauth/token response missing access_token');
    }

    const expiresInMs = Math.max(0, (body.expires_in ?? 0) * 1000);
    return {
      accessToken: body.access_token,
      tokenType: body.token_type ?? 'Bearer',
      expiresAt: Date.now() + expiresInMs,
      refreshToken: body.refresh_token,
    };
  }

  async createIntegrationRoute(
    gatewayUrl: string,
    accessToken: string,
    input: CreateIntegrationRouteInput
  ): Promise<GatewayIntegrationRoute> {
    const base = stripTrailingSlash(gatewayUrl);
    const url = `${base}/gateway/v1/integrations/routes`;

    const payload: Record<string, unknown> = {
      device_id: input.deviceId,
      interface_type: input.interfaceType,
      token_auth_mode: 'path',
    };
    if (input.routeToken !== undefined) payload.route_token = input.routeToken;
    if (input.tokenMaxAgeDays !== undefined) payload.token_max_age_days = input.tokenMaxAgeDays;
    if (input.maxBodyBytes !== undefined) payload.max_body_bytes = input.maxBodyBytes;
    if (input.deadlineMs !== undefined) payload.deadline_ms = input.deadlineMs;

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await readErrorBody(response);
      throw new Error(
        `Gateway /gateway/v1/integrations/routes failed with ${response.status}${
          detail ? `: ${detail}` : ''
        }`
      );
    }

    const body = (await response.json()) as {
      route?: { route_id?: string; device_id?: string; interface_type?: string };
      public_url?: string;
      route_token?: string;
    };

    const routeId = body.route?.route_id;
    const publicUrl = body.public_url;
    const routeToken = body.route_token;

    if (!routeId || !publicUrl || !routeToken) {
      throw new Error('Gateway route response missing route_id, public_url, or route_token');
    }

    return {
      routeId,
      routeToken,
      publicUrl,
      deviceId: body.route?.device_id ?? input.deviceId,
      interfaceType: body.route?.interface_type ?? input.interfaceType,
    };
  }
}
