/**
 * Webhook Service Interface
 *
 * Output port for managing webhook registrations with external services
 * (e.g., GitHub) and processing incoming webhook events.
 *
 * Works alongside the polling-based PrSyncWatcher to provide near-instant
 * event delivery when a tunnel is available, with polling as fallback.
 */

/**
 * Parsed webhook event from an external service.
 */
export interface WebhookEvent {
  /** Source service (e.g., 'github') */
  source: string;
  /** Event type (e.g., 'pull_request', 'check_suite') */
  eventType: string;
  /** Delivery ID for deduplication */
  deliveryId: string;
  /** Full event payload */
  payload: Record<string, unknown>;
}

/**
 * Result of webhook signature validation.
 */
export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

export interface IWebhookService {
  /**
   * Register webhooks for all tracked repositories.
   *
   * @param publicUrl - The public tunnel URL where webhooks will be received
   */
  registerWebhooks(publicUrl: string): Promise<void>;

  /**
   * Update the webhook URL for all registered webhooks.
   * Called when the tunnel reconnects with a new URL.
   *
   * @param newUrl - The new public tunnel URL
   */
  updateWebhookUrl(newUrl: string): Promise<void>;

  /**
   * Remove all registered webhooks (cleanup on shutdown).
   */
  removeWebhooks(): Promise<void>;

  /**
   * Validate an incoming webhook request signature.
   *
   * @param payload - Raw request body
   * @param signature - Signature header value
   * @param secret - The webhook secret used for HMAC
   * @returns Validation result
   */
  validateSignature(payload: string, signature: string, secret: string): WebhookValidationResult;

  /**
   * Process an incoming webhook event.
   * Routes the event to the appropriate handler (e.g., PR status update).
   *
   * @param event - The parsed webhook event
   */
  handleEvent(event: WebhookEvent): Promise<void>;
}
