/**
 * GitHub Webhook Receiver: POST /api/webhooks/github
 *
 * Receives webhook events from GitHub, validates the HMAC-SHA256 signature,
 * and routes the event to the GitHubWebhookService for processing.
 *
 * This endpoint is exposed via a Cloudflare Tunnel so GitHub can reach it.
 * Only POST requests are accepted; all other methods return 405.
 */

import { resolve } from '@/lib/server-container';
import type { GitHubWebhookService } from '@shepai/core/infrastructure/services/webhook/github-webhook.service';
import { hasWebhookManager } from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  // Verify webhook system is running
  if (!hasWebhookManager()) {
    return Response.json({ error: 'Webhook system not initialized' }, { status: 503 });
  }

  // Read raw body for signature validation
  const rawBody = await request.text();
  if (!rawBody) {
    return Response.json({ error: 'Empty request body' }, { status: 400 });
  }

  // Get the webhook service from DI container
  let webhookService: GitHubWebhookService;
  try {
    webhookService = resolve<GitHubWebhookService>('IGitHubWebhookService');
  } catch {
    return Response.json({ error: 'Webhook service not available' }, { status: 503 });
  }

  // Validate GitHub signature
  const signature = request.headers.get('x-hub-signature-256') ?? '';
  const validation = webhookService.validateSignature(
    rawBody,
    signature,
    webhookService.getSecret()
  );

  if (!validation.valid) {
    // eslint-disable-next-line no-console
    console.warn(`[WebhookRoute] Invalid signature: ${validation.error}`);
    return Response.json({ error: `Invalid signature: ${validation.error}` }, { status: 401 });
  }

  // Parse the event
  const eventType = request.headers.get('x-github-event') ?? 'unknown';
  const deliveryId = request.headers.get('x-github-delivery') ?? 'unknown';

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Process the event asynchronously (respond immediately to GitHub)
  void webhookService.handleEvent({
    source: 'github',
    eventType,
    deliveryId,
    payload,
  });

  return Response.json({ received: true, deliveryId });
}

/**
 * Health check: GET /api/webhooks/github
 * Returns whether the webhook system is active.
 */
export async function GET(): Promise<Response> {
  const active = hasWebhookManager();

  return Response.json({
    active,
    message: active
      ? 'Webhook receiver is active'
      : 'Webhook system not initialized (cloudflared may not be installed)',
  });
}
