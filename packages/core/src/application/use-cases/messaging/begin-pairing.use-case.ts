/**
 * Begin Messaging Pairing Use Case
 *
 * Initiates a pairing handshake for a messaging platform (Telegram/WhatsApp):
 *
 *   1. Validates the Gateway URL.
 *   2. Fetches an OAuth access token from the Gateway (demo mode uses the
 *      public client; OIDC mode would inject a real client secret).
 *   3. Creates an integration route on the Gateway for the target platform.
 *      The returned `publicUrl` is what the user must point their Telegram
 *      webhook (or WhatsApp callback) at.
 *   4. Generates a one-time 6-digit pairing code and persists it along with
 *      the newly-allocated route details on settings.
 *   5. Returns a session DTO for the presentation layer to render.
 *
 * The pairing is finalized when either:
 *   - The daemon's tunnel receives a `/pair <code>` message via a
 *     `tunnel.request` frame and calls ConfirmMessagingPairingUseCase (future
 *     auto-confirm path), or
 *   - The user clicks "Confirm pairing" in the UI / CLI after seeing the
 *     code echoed by their bot (current manual path).
 */

import { injectable, inject } from 'tsyringe';
import { randomInt, randomUUID } from 'node:crypto';
import { MessagingPlatform } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IGatewayClient } from '../../ports/output/services/gateway-client.interface.js';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_GATEWAY_CLIENT_ID = 'commands-desktop-public';

export interface BeginMessagingPairingInput {
  platform: MessagingPlatform;
  gatewayUrl: string;
}

export interface MessagingPairingSession {
  platform: MessagingPlatform;
  code: string;
  /** ISO-8601 expiry. */
  expiresAt: string;
  gatewayUrl: string;
  /** Public webhook URL the platform should POST updates to. */
  publicUrl: string;
  routeId: string;
}

function assertValidGatewayUrl(url: string): void {
  if (!url?.trim()) {
    throw new Error('Gateway URL is required to begin pairing.');
  }
  try {
    const parsed = new URL(url);
    if (!parsed.protocol) {
      throw new Error('invalid');
    }
  } catch {
    throw new Error('Gateway URL must be a valid URL (e.g., https://gateway.example.com).');
  }
}

function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function platformKey(platform: MessagingPlatform): 'telegram' | 'whatsapp' {
  return platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';
}

@injectable()
export class BeginMessagingPairingUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('IGatewayClient')
    private readonly gatewayClient: IGatewayClient
  ) {}

  async execute(input: BeginMessagingPairingInput): Promise<MessagingPairingSession> {
    assertValidGatewayUrl(input.gatewayUrl);

    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    const existing = settings.messaging ?? {
      enabled: false,
      debounceMs: 5000,
      chatBufferMs: 3000,
    };

    // Device ID is stable across platforms and across pairings. Generate
    // lazily on first pairing so the gateway can scope all routes + the
    // tunnel connection to the same device owner.
    const deviceId = existing.deviceId ?? `shep-${randomUUID()}`;
    const clientId = existing.gatewayClientId ?? DEFAULT_GATEWAY_CLIENT_ID;
    const key = platformKey(input.platform);

    // 1. Fetch OAuth access token from the gateway.
    let accessToken: string;
    try {
      const token = await this.gatewayClient.fetchAccessToken({
        gatewayUrl: input.gatewayUrl,
        clientId,
      });
      accessToken = token.accessToken;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gateway authentication failed: ${msg}`);
    }

    // 2. Create an integration route for this platform.
    let route;
    try {
      route = await this.gatewayClient.createIntegrationRoute(input.gatewayUrl, accessToken, {
        deviceId,
        interfaceType: key,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gateway route registration failed: ${msg}`);
    }

    // 3. Generate pairing code + persist everything.
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();

    const existingPlatform = existing[key] ?? { enabled: false, paired: false };

    settings.messaging = {
      ...existing,
      enabled: true,
      gatewayUrl: input.gatewayUrl,
      deviceId,
      gatewayClientId: clientId,
      [key]: {
        ...existingPlatform,
        enabled: true,
        paired: false,
        pendingPairingCode: code,
        pendingPairingExpiresAt: expiresAt,
        routeId: route.routeId,
        routeToken: route.routeToken,
        publicUrl: route.publicUrl,
      },
    };
    settings.updatedAt = new Date();

    await this.settingsRepository.update(settings);

    return {
      platform: input.platform,
      code,
      expiresAt,
      gatewayUrl: input.gatewayUrl,
      publicUrl: route.publicUrl,
      routeId: route.routeId,
    };
  }
}
