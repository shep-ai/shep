/**
 * @module Shep.Domain.Entities.Messaging
 *
 * Defines models for the external messaging remote control feature.
 * These are value objects (no BaseEntity inheritance) since they represent
 * transient protocol messages exchanged between Shep and the Gateway.
 *
 * ## Message Flow
 *
 * ```
 * Phone (Telegram/WhatsApp)
 *   → Gateway (webhook → command parser → tunnel)
 *   → Shep Daemon (command executor / notification emitter)
 *   → Gateway (tunnel → platform adapter → send)
 *   → Phone
 * ```
 */
import "../../common/enums/messaging.tsp";

@doc("A parsed command received from a messaging platform via the Gateway tunnel")
model MessagingCommand {
  @doc("Type of frame: command, chat_message, or chat_control")
  type: MessagingFrameType;

  @doc("The slash command name (new, approve, reject, stop, resume, status)")
  command: MessagingCommandType;

  @doc("Target feature ID (short numeric or full UUID)")
  featureId?: string;

  @doc("Free-text arguments (feature description, rejection feedback, chat text)")
  args?: string;

  @doc("Chat ID for routing responses back to the correct conversation")
  chatId: string;

  @doc("Platform for routing responses back (telegram or whatsapp)")
  platform: MessagingPlatform;
}

@doc("A notification or response sent from Shep to a messaging platform via the Gateway tunnel")
model MessagingNotification {
  @doc("Event type: feature lifecycle, CI status, gate waiting, command response, chat response")
  event: string;

  @doc("ID of the feature this notification relates to")
  featureId: string;

  @doc("Human-readable feature name or title")
  title: string;

  @doc("Human-readable notification body (sanitized, no code or secrets)")
  message: string;
}
