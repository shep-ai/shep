/**
 * Webhook Delivery Port Interface
 *
 * Abstracts outbound webhook delivery for integrations
 * (Slack, custom endpoints, etc.)
 */
export interface WebhookPayload {
  event: string;
  projectId?: string;
  actorId?: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface IWebhookService {
  /**
   * Send a webhook payload to all registered endpoints for the given event.
   * Returns the count of successfully delivered webhooks.
   */
  deliver(payload: WebhookPayload): Promise<number>;
}
