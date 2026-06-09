/**
 * Webhook Delivery History: GET /api/webhooks/deliveries
 *
 * Returns recent webhook delivery records with optional filtering.
 * Query params: ?status=success|error|ignored&eventType=pull_request&limit=50
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!hasWebhookManager()) {
    return Response.json({ deliveries: [] });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const eventTypeFilter = url.searchParams.get('eventType');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  const manager = getWebhookManager();
  let deliveries = [...manager.getDeliveryHistory()];

  if (statusFilter) {
    deliveries = deliveries.filter((d) => d.status === statusFilter);
  }
  if (eventTypeFilter) {
    deliveries = deliveries.filter((d) => d.eventType === eventTypeFilter);
  }

  return Response.json({ deliveries: deliveries.slice(0, limit) });
}
