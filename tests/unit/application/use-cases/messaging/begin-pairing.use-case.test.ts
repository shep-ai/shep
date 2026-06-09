/**
 * BeginMessagingPairingUseCase Unit Tests
 *
 * Covers the TDD contract for the pairing flow:
 *   1. Validate gateway URL + required inputs
 *   2. Fetch an OAuth access token from the gateway
 *   3. Create an integration route for the target platform
 *   4. Persist routeId / routeToken / publicUrl + pending pairing code
 *   5. Return a session DTO the presentation layer can render
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BeginMessagingPairingUseCase } from '@/application/use-cases/messaging/begin-pairing.use-case.js';
import { MockSettingsRepository } from '../../../../helpers/mock-repository.helper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { MessagingPlatform } from '@/domain/generated/output.js';
import type {
  IGatewayClient,
  GatewayIntegrationRoute,
  GatewayOAuthToken,
} from '@/application/ports/output/services/gateway-client.interface.js';

function makeMockGatewayClient(overrides: Partial<IGatewayClient> = {}): IGatewayClient {
  const token: GatewayOAuthToken = {
    accessToken: 'tok-123',
    tokenType: 'Bearer',
    expiresAt: Date.now() + 3_600_000,
  };
  const route: GatewayIntegrationRoute = {
    routeId: 'route-abc',
    routeToken: 'rt-xyz',
    publicUrl: 'http://localhost:8080/integrations/route-abc/rt-xyz',
    deviceId: 'dev-1',
    interfaceType: 'telegram',
  };
  return {
    fetchAccessToken: vi.fn().mockResolvedValue(token),
    createIntegrationRoute: vi.fn().mockResolvedValue(route),
    ...overrides,
  };
}

describe('BeginMessagingPairingUseCase', () => {
  let useCase: BeginMessagingPairingUseCase;
  let mockRepository: MockSettingsRepository;
  let gatewayClient: IGatewayClient;

  beforeEach(async () => {
    mockRepository = new MockSettingsRepository();
    await mockRepository.initialize(createDefaultSettings());
    gatewayClient = makeMockGatewayClient();
    useCase = new BeginMessagingPairingUseCase(mockRepository as never, gatewayClient);
  });

  it('fails if gatewayUrl is missing', async () => {
    await expect(
      useCase.execute({ platform: MessagingPlatform.Telegram, gatewayUrl: '' })
    ).rejects.toThrow(/gateway url/i);
  });

  it('fails if gatewayUrl is not a valid URL', async () => {
    await expect(
      useCase.execute({ platform: MessagingPlatform.Telegram, gatewayUrl: 'not a url' })
    ).rejects.toThrow(/valid url/i);
  });

  it('returns a 6-digit pairing code and expiry for telegram', async () => {
    const session = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    expect(session.code).toMatch(/^\d{6}$/);
    expect(session.platform).toBe(MessagingPlatform.Telegram);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('fetches an OAuth token and creates an integration route', async () => {
    await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    expect(gatewayClient.fetchAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayUrl: 'https://gateway.example.com' })
    );
    expect(gatewayClient.createIntegrationRoute).toHaveBeenCalledWith(
      'https://gateway.example.com',
      'tok-123',
      expect.objectContaining({ interfaceType: 'telegram' })
    );
  });

  it('persists the pairing session + route details on the platform config', async () => {
    const session = await useCase.execute({
      platform: MessagingPlatform.WhatsApp,
      gatewayUrl: 'https://gateway.example.com',
    });
    const saved = await mockRepository.load();
    expect(saved?.messaging?.enabled).toBe(true);
    expect(saved?.messaging?.gatewayUrl).toBe('https://gateway.example.com');
    expect(saved?.messaging?.deviceId).toBeDefined();
    expect(saved?.messaging?.whatsapp?.enabled).toBe(true);
    expect(saved?.messaging?.whatsapp?.paired).toBe(false);
    expect(saved?.messaging?.whatsapp?.pendingPairingCode).toBe(session.code);
    expect(saved?.messaging?.whatsapp?.routeId).toBe('route-abc');
    expect(saved?.messaging?.whatsapp?.routeToken).toBe('rt-xyz');
    expect(saved?.messaging?.whatsapp?.publicUrl).toBe(
      'http://localhost:8080/integrations/route-abc/rt-xyz'
    );
  });

  it('returns the publicUrl in the session DTO', async () => {
    const session = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    expect(session.publicUrl).toBe('http://localhost:8080/integrations/route-abc/rt-xyz');
  });

  it('reuses an existing deviceId across platforms', async () => {
    await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    const first = (await mockRepository.load())?.messaging?.deviceId;
    await useCase.execute({
      platform: MessagingPlatform.WhatsApp,
      gatewayUrl: 'https://gateway.example.com',
    });
    const second = (await mockRepository.load())?.messaging?.deviceId;
    expect(second).toBe(first);
  });

  it('generates a distinct code on each invocation', async () => {
    const a = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    const b = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      gatewayUrl: 'https://gateway.example.com',
    });
    expect(a.code).not.toBe(b.code);
  });

  it('wraps gateway client errors with context', async () => {
    const failing = makeMockGatewayClient({
      fetchAccessToken: vi.fn().mockRejectedValue(new Error('boom')),
    });
    useCase = new BeginMessagingPairingUseCase(mockRepository as never, failing);
    await expect(
      useCase.execute({
        platform: MessagingPlatform.Telegram,
        gatewayUrl: 'https://gateway.example.com',
      })
    ).rejects.toThrow(/gateway/i);
  });
});
