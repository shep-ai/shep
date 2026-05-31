/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WhatsApp Baileys Gateway (spec 101)
 *
 * Unofficial WhatsApp Web adapter for IWhatsAppGateway, backed by
 * `@whiskeysockets/baileys`. The package is an OPTIONAL, user-installed
 * dependency: it carries a large, partly-native transitive tree that we keep
 * out of shep's eager build graph. It is loaded via a NON-LITERAL dynamic
 * import so typecheck/build stay green whether or not it is installed; when it
 * is missing, connect() surfaces a clear, actionable install hint.
 *
 * Auth state (the linked-number credentials) is persisted under the shep home
 * directory so the link survives restarts. QR / pairing drives linking.
 *
 * `any` is unavoidable at this boundary: the dependency is intentionally
 * untyped here. Provider shapes are confined to this file; the pure
 * `mapBaileysMessage` helper below is fully typed and unit-tested.
 */

import { join } from 'node:path';
import { injectable, inject } from 'tsyringe';

import type {
  IWhatsAppGateway,
  WhatsAppConnectionInfo,
  WhatsAppInboundHandler,
  WhatsAppInboundMessage,
} from '../../../application/ports/output/services/whatsapp-gateway.interface.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { WhatsAppConnectionStatus } from '../../../domain/generated/output.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';

/** Optional dependency — see the file header. */
const BAILEYS_PACKAGE = '@whiskeysockets/baileys';

/** Error thrown when the optional Baileys package is not installed. */
export class BaileysNotInstalledError extends Error {
  constructor() {
    super(
      `The Baileys adapter requires the optional "${BAILEYS_PACKAGE}" package. ` +
        `Install it to enable WhatsApp via the unofficial Web API: ` +
        `\`pnpm add ${BAILEYS_PACKAGE}\`. Alternatively switch to the Cloud API adapter in Settings → WhatsApp.`
    );
    this.name = 'BaileysNotInstalledError';
  }
}

@injectable()
export class WhatsAppBaileysGateway implements IWhatsAppGateway {
  private readonly handlers: WhatsAppInboundHandler[] = [];
  private status: WhatsAppConnectionStatus = WhatsAppConnectionStatus.Disconnected;
  private sock: any = null;
  private qr?: string;
  private linkedNumber?: string;
  private loggedOut = false;

  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  /** Where multi-file auth state is persisted. */
  private authDir(): string {
    return join(getShepHomeDir(), 'whatsapp', 'baileys-auth');
  }

  /**
   * Load the optional Baileys module. Uses a string variable specifier so the
   * TypeScript compiler does not try to resolve the (optional) module.
   */
  private async loadBaileys(): Promise<any> {
    const pkg: string = BAILEYS_PACKAGE;
    try {
      return await import(pkg);
    } catch {
      throw new BaileysNotInstalledError();
    }
  }

  async connect(): Promise<void> {
    if (this.status === WhatsAppConnectionStatus.Connected) return;
    this.loggedOut = false;
    this.status = WhatsAppConnectionStatus.Connecting;

    const baileys = await this.loadBaileys();
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir());
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update: any) => {
      if (update.qr) {
        this.qr = update.qr;
        this.status = WhatsAppConnectionStatus.AwaitingScan;
      }
      if (update.connection === 'open') {
        this.qr = undefined;
        this.status = WhatsAppConnectionStatus.Connected;
        this.linkedNumber = normalizeJidToNumber(sock.user?.id);
      }
      if (update.connection === 'close') {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
        if (isLoggedOut || this.loggedOut) {
          this.status = WhatsAppConnectionStatus.Disconnected;
        } else {
          this.status = WhatsAppConnectionStatus.Connecting;
          // Auto-reconnect with a small backoff.
          setTimeout(() => {
            void this.connect().catch((err) => {
              this.logger.error('[whatsapp:baileys] reconnect failed', {
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }, 2000);
        }
      }
    });

    sock.ev.on('messages.upsert', (payload: any) => {
      const messages: unknown[] = Array.isArray(payload?.messages) ? payload.messages : [];
      for (const raw of messages) {
        const mapped = mapBaileysMessage(raw);
        if (mapped) void this.dispatch(mapped);
      }
    });
  }

  private async dispatch(message: WhatsAppInboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(message);
      } catch (err) {
        this.logger.error('[whatsapp:baileys] inbound handler failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.sock?.end?.(undefined);
    } finally {
      this.sock = null;
      this.status = WhatsAppConnectionStatus.Disconnected;
    }
  }

  async logout(): Promise<void> {
    this.loggedOut = true;
    try {
      await this.sock?.logout?.();
    } catch {
      // best-effort
    }
    this.sock = null;
    this.linkedNumber = undefined;
    this.qr = undefined;
    this.status = WhatsAppConnectionStatus.Disconnected;
  }

  async sendMessage(threadId: string, text: string): Promise<void> {
    if (!this.sock) {
      throw new Error('WhatsApp (Baileys) is not connected.');
    }
    await this.sock.sendMessage(threadId, { text });
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
      ...(this.qr ? { qr: this.qr } : {}),
    };
  }
}

/** Convert a Baileys JID like "972500000000:12@s.whatsapp.net" to "+972500000000". */
export function normalizeJidToNumber(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  const digits = jid.split(/[:@]/)[0]?.replace(/\D/g, '');
  return digits ? `+${digits}` : undefined;
}

/**
 * Map a raw Baileys message object to a normalized inbound message, or null if
 * it should be ignored (sent by us, no text body, or no sender). Pure + typed
 * for unit testing without the real dependency.
 */
export function mapBaileysMessage(raw: unknown): WhatsAppInboundMessage | null {
  const m = raw as {
    key?: { remoteJid?: string; fromMe?: boolean };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
    messageTimestamp?: number | { toNumber?: () => number };
  };

  if (!m?.key?.remoteJid || m.key.fromMe) return null;

  const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text;
  if (!text || text.trim().length === 0) return null;

  const from = normalizeJidToNumber(m.key.remoteJid);
  if (!from) return null;

  let timestamp = Date.now();
  const ts = m.messageTimestamp;
  if (typeof ts === 'number') timestamp = ts * 1000;
  else if (ts && typeof ts.toNumber === 'function') timestamp = ts.toNumber() * 1000;

  return { threadId: m.key.remoteJid, from, text, timestamp };
}
