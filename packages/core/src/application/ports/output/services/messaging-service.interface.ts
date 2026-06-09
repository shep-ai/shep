/**
 * Messaging Service Interface
 *
 * Output port for the external messaging remote control subsystem.
 * Enables controlling Shep via Telegram/WhatsApp through the
 * Commands.com Gateway tunnel.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementation (MessagingService)
 */

import type { MessagingNotification } from '../../../../domain/generated/output.js';

/**
 * Port interface for the messaging remote control service.
 *
 * Implementations must:
 * - Connect to the Gateway via WebSocket tunnel
 * - Handle inbound commands (parsed by Gateway) and map them to use cases
 * - Push outbound notifications through the tunnel for delivery to messaging apps
 * - Support interactive chat relay between messaging apps and agent sessions
 */
export interface IMessagingService {
  /** Start listening for inbound commands from the Gateway tunnel */
  start(): Promise<void>;

  /** Stop the messaging service and disconnect from the tunnel */
  stop(): Promise<void>;

  /** Send a notification to the user's messaging app via the Gateway */
  sendNotification(notification: MessagingNotification): Promise<void>;

  /** Check if messaging is configured and connected */
  isConnected(): boolean;

  /** Check if messaging is configured (credentials present, even if not connected) */
  isConfigured(): boolean;
}
