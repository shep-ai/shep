/**
 * Webhook System Status: GET /api/webhooks/status
 *
 * Returns the full webhook system status including tunnel state,
 * registered webhooks, and delivery statistics.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (!hasWebhookManager()) {
    return Response.json({
      running: false,
      tunnel: { connected: false, publicUrl: null },
      webhooks: {
        registered: [],
        totalDeliveries: 0,
        successCount: 0,
        errorCount: 0,
        ignoredCount: 0,
      },
      startedAt: null,
    });
  }

  const manager = getWebhookManager();
  return Response.json(manager.getStatus());
}
