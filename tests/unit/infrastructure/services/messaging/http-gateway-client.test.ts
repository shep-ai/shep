/**
 * HttpGatewayClient Unit Tests
 *
 * TDD RED: these tests are written before the adapter exists and drive its
 * implementation. The adapter is a thin HTTP client over the Commands.com
 * Gateway OpenAPI — we mock fetch and assert request shape + response mapping.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpGatewayClient } from '@/infrastructure/services/messaging/http-gateway.client.js';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpGatewayClient', () => {
  let fetchMock: FetchMock;
  let client: HttpGatewayClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new HttpGatewayClient(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAccessToken', () => {
    it('POSTs to /oauth/token with client_credentials grant and form body', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          access_token: 'tok-abc',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'rtok-xyz',
        })
      );

      const token = await client.fetchAccessToken({
        gatewayUrl: 'http://localhost:8080',
        clientId: 'commands-desktop-public',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8080/oauth/token');
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).headers).toMatchObject({
        'content-type': 'application/x-www-form-urlencoded',
      });
      expect((init as RequestInit).body as string).toContain('grant_type=client_credentials');
      expect((init as RequestInit).body as string).toContain('client_id=commands-desktop-public');

      expect(token.accessToken).toBe('tok-abc');
      expect(token.tokenType).toBe('Bearer');
      expect(token.refreshToken).toBe('rtok-xyz');
      expect(token.expiresAt).toBeGreaterThan(Date.now());
      expect(token.expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000 + 500);
    });

    it('strips trailing slash from gatewayUrl', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ access_token: 't', token_type: 'Bearer', expires_in: 60 })
      );

      await client.fetchAccessToken({
        gatewayUrl: 'http://localhost:8080/',
        clientId: 'cid',
      });

      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/oauth/token');
    });

    it('throws a descriptive error on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );

      await expect(
        client.fetchAccessToken({ gatewayUrl: 'http://localhost:8080', clientId: 'cid' })
      ).rejects.toThrow(/gateway.*token.*401/i);
    });
  });

  describe('createIntegrationRoute', () => {
    it('POSTs to /gateway/v1/integrations/routes with bearer auth and required body', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            route: {
              route_id: 'r-123',
              device_id: 'dev-abc',
              interface_type: 'telegram',
            },
            public_url: 'http://localhost:8080/integrations/r-123/tok-xyz',
            route_token: 'tok-xyz',
          },
          { status: 201 }
        )
      );

      const route = await client.createIntegrationRoute('http://localhost:8080', 'bearer-value', {
        deviceId: 'dev-abc',
        interfaceType: 'telegram',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8080/gateway/v1/integrations/routes');
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).headers).toMatchObject({
        authorization: 'Bearer bearer-value',
        'content-type': 'application/json',
      });

      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toMatchObject({
        device_id: 'dev-abc',
        interface_type: 'telegram',
        token_auth_mode: 'path',
      });

      expect(route.routeId).toBe('r-123');
      expect(route.routeToken).toBe('tok-xyz');
      expect(route.publicUrl).toBe('http://localhost:8080/integrations/r-123/tok-xyz');
      expect(route.deviceId).toBe('dev-abc');
      expect(route.interfaceType).toBe('telegram');
    });

    it('passes through optional fields when provided', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            route: { route_id: 'r', device_id: 'd', interface_type: 'telegram' },
            public_url: 'x',
            route_token: 't',
          },
          { status: 201 }
        )
      );

      await client.createIntegrationRoute('http://localhost:8080', 'bt', {
        deviceId: 'd',
        interfaceType: 'telegram',
        routeToken: 'fixed-token',
        tokenMaxAgeDays: 30,
        maxBodyBytes: 1024,
        deadlineMs: 5000,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({
        route_token: 'fixed-token',
        token_max_age_days: 30,
        max_body_bytes: 1024,
        deadline_ms: 5000,
      });
    });

    it('throws on non-2xx with gateway error message', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'device_not_found' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      );

      await expect(
        client.createIntegrationRoute('http://localhost:8080', 'bt', {
          deviceId: 'd',
          interfaceType: 'telegram',
        })
      ).rejects.toThrow(/gateway.*route.*400.*device_not_found/i);
    });

    it('throws if the gateway returns a 2xx without a public_url', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ route: { route_id: 'r' } }, { status: 201 }));

      await expect(
        client.createIntegrationRoute('http://localhost:8080', 'bt', {
          deviceId: 'd',
          interfaceType: 'telegram',
        })
      ).rejects.toThrow(/public_url/);
    });
  });
});
