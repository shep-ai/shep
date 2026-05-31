/**
 * WhatsApp Cloud API Gateway (spec 101)
 *
 * Official WhatsApp Business Cloud API adapter for IWhatsAppGateway. Uses the
 * global `fetch` (no new dependencies). Outbound = Graph API POST; inbound =
 * webhook delivered by Meta to a presentation-layer route which forwards the
 * raw payload to `handleWebhook()`.
 *
 * Ban-safe alternative to the Baileys adapter; requires a Meta Business account
 * and the Cloud API credentials persisted in Settings.whatsapp.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { injectable, inject } from 'tsyringe';

import type {
  IWhatsAppGateway,
  WhatsAppConnectionInfo,
  WhatsAppInboundHandler,
  WhatsAppInboundMessage,
} from '../../../application/ports/output/services/whatsapp-gateway.interface.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { WhatsAppConnectionStatus, type WhatsAppConfig } from '../../../domain/generated/output.js';

/** Graph API host + version. Centralized to avoid magic strings. */
const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_API_VERSION = 'v21.0';
const WEBHOOK_SUBSCRIBE_MODE = 'subscribe';
const MESSAGING_PRODUCT = 'whatsapp';

@injectable()
export class WhatsAppCloudApiGateway implements IWhatsAppGateway {
  private readonly handlers: WhatsAppInboundHandler[] = [];
  private status: WhatsAppConnectionStatus = WhatsAppConnectionStatus.Disconnected;
  private linkedNumber?: string;

  constructor(
    @inject('ISettingsRepository') private readonly settingsRepository: ISettingsRepository,
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  private async getConfig(): Promise<WhatsAppConfig | undefined> {
    const settings = await this.settingsRepository.load();
    return settings?.whatsapp;
  }

  async connect(): Promise<void> {
    const config = await this.getConfig();
    if (!config?.cloudApiPhoneNumberId || !config.cloudApiAccessToken) {
      this.status = WhatsAppConnectionStatus.Error;
      this.logger.warn('[whatsapp:cloud] missing Cloud API credentials; cannot connect');
      return;
    }
    this.linkedNumber = config.linkedNumber;
    this.status = WhatsAppConnectionStatus.Connected;
  }

  async disconnect(): Promise<void> {
    this.status = WhatsAppConnectionStatus.Disconnected;
  }

  async logout(): Promise<void> {
    this.status = WhatsAppConnectionStatus.Disconnected;
    this.linkedNumber = undefined;
  }

  async sendMessage(threadId: string, text: string): Promise<void> {
    const config = await this.getConfig();
    if (!config?.cloudApiPhoneNumberId || !config.cloudApiAccessToken) {
      throw new Error('WhatsApp Cloud API is not configured (missing phone number id or token).');
    }

    const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${config.cloudApiPhoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cloudApiAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: MESSAGING_PRODUCT,
        recipient_type: 'individual',
        to: threadId,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`WhatsApp Cloud API send failed (${response.status}): ${detail}`);
    }
  }

  onInbound(handler: WhatsAppInboundHandler): void {
    this.handlers.push(handler);
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  getConnectionInfo(): WhatsAppConnectionInfo {
    return {
      status: this.status,
      ...(this.linkedNumber ? { linkedNumber: this.linkedNumber } : {}),
    };
  }

  // ── Cloud-API-specific webhook surface (called by the presentation route) ──

  /**
   * Webhook verification handshake. Returns the challenge string to echo back
   * when the mode + verify token match, or null to reject.
   */
  verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === WEBHOOK_SUBSCRIBE_MODE && token === verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Verify the X-Hub-Signature-256 header against the raw request body using the
   * app secret. Constant-time comparison. Returns false on any mismatch.
   */
  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    appSecret: string
  ): boolean {
    if (!signatureHeader) return false;
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Parse a Cloud API webhook payload into normalized inbound messages and
   * dispatch each to the registered handlers. Non-message events are ignored.
   */
  async handleWebhook(payload: unknown): Promise<WhatsAppInboundMessage[]> {
    const messages = parseCloudApiMessages(payload);
    for (const message of messages) {
      for (const handler of this.handlers) {
        try {
          await handler(message);
        } catch (err) {
          this.logger.error('[whatsapp:cloud] inbound handler failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return messages;
  }
}

/**
 * Extract inbound text messages from a Cloud API webhook payload.
 * Exported for unit testing.
 */
export function parseCloudApiMessages(payload: unknown): WhatsAppInboundMessage[] {
  const result: WhatsAppInboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return result;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const msg of messages) {
        const m = msg as {
          from?: string;
          text?: { body?: string };
          timestamp?: string;
          type?: string;
        };
        if (m.type !== 'text' || !m.from || !m.text?.body) continue;
        const from = m.from.startsWith('+') ? m.from : `+${m.from}`;
        result.push({
          threadId: m.from,
          from,
          text: m.text.body,
          timestamp: m.timestamp ? Number(m.timestamp) * 1000 : Date.now(),
        });
      }
    }
  }
  return result;
}
