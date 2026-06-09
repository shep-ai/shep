/**
 * Message Sender Interface
 *
 * Output port for delivering outbound messaging notifications to an end user
 * (Telegram chat, WhatsApp conversation, etc.). Implementations make direct
 * HTTPS calls to the respective platform APIs — the tunnel is for inbound
 * webhook relay only, not for pushing notifications.
 */

import type { MessagingNotification } from '../../../../domain/generated/output.js';

export interface IMessageSender {
  /**
   * Deliver a notification to the configured end user. Implementations
   * should handle platform routing (telegram vs whatsapp) internally based
   * on current settings, and silently no-op if no platform is paired.
   */
  send(notification: MessagingNotification): Promise<void>;
}
