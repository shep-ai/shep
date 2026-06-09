/**
 * @module Shep.Common.Enums.Messaging
 *
 * Defines enums for the external messaging remote control subsystem.
 * These enums classify messaging platforms, command types, and
 * tunnel frame types used for Telegram/WhatsApp remote control
 * of Shep via the Commands.com Gateway.
 */
@doc("Supported external messaging platforms")
enum MessagingPlatform {
  @doc("Telegram Bot API")
  Telegram: "telegram",

  @doc("WhatsApp Business Cloud API")
  WhatsApp: "whatsapp",
}

@doc("Types of messages exchanged through the messaging tunnel")
enum MessagingFrameType {
  @doc("A parsed slash command from the user")
  Command: "command",

  @doc("A free-text chat message relayed to an interactive session")
  ChatMessage: "chat_message",

  @doc("A chat control command (start/end relay)")
  ChatControl: "chat_control",
}

@doc("Slash commands supported via messaging remote control")
enum MessagingCommandType {
  @doc("Create a new feature")
  New: "new",

  @doc("Approve a gate on a feature")
  Approve: "approve",

  @doc("Reject a gate with feedback")
  Reject: "reject",

  @doc("Stop the agent on a feature")
  Stop: "stop",

  @doc("Resume a paused feature")
  Resume: "resume",

  @doc("Show feature status")
  Status: "status",

  @doc("Mute notifications for a feature")
  Mute: "mute",

  @doc("Unmute notifications for a feature")
  Unmute: "unmute",

  @doc("List all features")
  List: "list",

  @doc("Start an interactive chat relay against a feature")
  Chat: "chat",

  @doc("End the active interactive chat relay")
  End: "end",

  @doc("Show help text")
  Help: "help",
}
