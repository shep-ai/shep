/**
 * WhatsApp Gateway (output port) — spec 101
 *
 * Provider-agnostic contract for the WhatsApp messaging channel. Both the
 * Baileys (unofficial WhatsApp Web) and the official Cloud API adapters
 * implement this interface; no provider SDK shape leaks through it.
 *
 * Following Clean Architecture:
 * - Application layer (connection service, use cases) depends on this interface.
 * - Infrastructure provides the concrete adapters (WhatsAppBaileysGateway,
 *   WhatsAppCloudApiGateway).
 *
 * The gateway ONLY transports messages and manages the connection. It contains
 * NO business logic — deciding what an inbound message means and what to do
 * about it is the job of the application-layer use cases.
 */

import type { WhatsAppConnectionStatus } from '../../../../domain/generated/output.js';

/**
 * A normalized inbound WhatsApp text message, stripped of provider specifics.
 */
export interface WhatsAppInboundMessage {
  /**
   * Stable identifier of the conversation thread the message arrived on
   * (e.g. the chat JID for Baileys, the sender wa_id for the Cloud API).
   * Used as the key for the thread↔session mapping.
   */
  threadId: string;

  /** Sender phone number in E.164 form (e.g. "+972500000000"). */
  from: string;

  /** Plain-text body of the message. */
  text: string;

  /** Message timestamp in milliseconds since the epoch. */
  timestamp: number;
}

/**
 * Handler invoked for every inbound message the gateway receives.
 * Implementations of the gateway call all registered handlers; errors thrown by
 * a handler must be isolated (logged, not allowed to tear down the connection).
 */
export type WhatsAppInboundHandler = (message: WhatsAppInboundMessage) => Promise<void> | void;

/**
 * Snapshot of the gateway's connection, surfaced to Settings / CLI.
 */
export interface WhatsAppConnectionInfo {
  status: WhatsAppConnectionStatus;

  /** Linked number in E.164 form once paired. */
  linkedNumber?: string;

  /**
   * QR payload to render for linking (Baileys). Present only while the status
   * is AwaitingScan and the adapter uses QR linking.
   */
  qr?: string;

  /** Pairing code to type into WhatsApp (Baileys alternative to QR). */
  pairingCode?: string;

  /** Human-readable detail (e.g. last error message). */
  detail?: string;
}

/**
 * The WhatsApp messaging gateway.
 */
export interface IWhatsAppGateway {
  /**
   * Establish (or resume) the connection. Idempotent: calling connect() on an
   * already-connected gateway is a no-op. For Baileys this loads persisted auth
   * state and, when unlinked, transitions to AwaitingScan.
   */
  connect(): Promise<void>;

  /**
   * Tear down the connection without dropping persisted credentials, so a later
   * connect() can resume the same linked number.
   */
  disconnect(): Promise<void>;

  /**
   * Drop persisted credentials and disconnect (full unlink). After logout(),
   * connect() will require a fresh QR/pairing or new Cloud API config.
   */
  logout(): Promise<void>;

  /**
   * Send a plain-text message to a thread.
   *
   * @param threadId - Thread/recipient identifier (see WhatsAppInboundMessage.threadId).
   * @param text - Message body.
   */
  sendMessage(threadId: string, text: string): Promise<void>;

  /**
   * Register a handler for inbound messages. May be called multiple times to
   * register several handlers.
   */
  onInbound(handler: WhatsAppInboundHandler): void;

  /** Current connection status. */
  getStatus(): WhatsAppConnectionStatus;

  /** Current connection snapshot, including any QR/pairing payload. */
  getConnectionInfo(): WhatsAppConnectionInfo;
}

/** DI token for the active, settings-selected WhatsApp gateway. */
export const WHATSAPP_GATEWAY_TOKEN = 'IWhatsAppGateway';
