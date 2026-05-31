/**
 * @module Shep.Common.Enums.WhatsApp
 *
 * Enums for the WhatsApp task-dispatch integration (spec 101).
 *
 * WhatsApp is an additional presentation/transport surface over the existing
 * core API. These enums are provider-agnostic: they describe which messaging
 * adapter is active, the live connection status, and what kind of shep entity
 * a WhatsApp thread is bound to — without leaking any provider SDK shapes.
 */
/**
 * Which WhatsApp messaging adapter backs the gateway.
 *
 * Both adapters implement the same IWhatsAppGateway port and are selectable in
 * Settings. Baileys is the default (no Meta approval, mobile-first) but carries
 * WhatsApp ToS / ban risk; the Cloud API is ban-safe but requires a Meta
 * Business account and approved templates.
 */
@doc("WhatsApp messaging adapter selection")
enum WhatsAppAdapterKind {
  @doc("Unofficial WhatsApp Web via Baileys (default; QR/pairing link)")
  Baileys: "baileys",

  @doc("Official WhatsApp Business Cloud API (ban-safe; Meta Business required)")
  CloudApi: "cloud-api",
}

/**
 * Live status of the WhatsApp connection.
 *
 * Surfaced in Settings and via the connection service health check. The
 * AwaitingScan state is Baileys-specific (QR/pairing) but kept generic so the
 * UI can render a single status badge regardless of adapter.
 */
@doc("WhatsApp connection status")
enum WhatsAppConnectionStatus {
  @doc("Not connected and not attempting to connect")
  Disconnected: "disconnected",

  @doc("Connection attempt in progress")
  Connecting: "connecting",

  @doc("Waiting for the user to scan a QR code / enter a pairing code")
  AwaitingScan: "awaiting-scan",

  @doc("Connected and able to send/receive messages")
  Connected: "connected",

  @doc("Connection failed; see logs / status detail")
  Error: "error",
}

/**
 * The kind of shep entity a WhatsApp thread is bound to.
 *
 * Determines how a reply in that thread is routed by RouteWhatsAppReplyUseCase:
 * a Feature thread routes to HITL approve/reject or answer-question; an
 * Application thread routes to the interactive session.
 */
@doc("Kind of shep entity a WhatsApp thread maps to")
enum WhatsAppThreadTargetKind {
  @doc("Thread is bound to a shep feature (autonomous workflow)")
  Feature: "feature",

  @doc("Thread is bound to an interactive application session")
  Application: "application",
}
