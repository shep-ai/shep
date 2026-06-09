'use server';

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';
import type { WebhookSystemStatus } from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export async function loadWebhookStatus(): Promise<WebhookSystemStatus> {
  if (!hasWebhookManager()) {
    return {
      running: false,
      tunnel: { connected: false, publicUrl: null },
      webhooks: {
        registered: [],
        subscribedEvents: [],
        totalDeliveries: 0,
        successCount: 0,
        errorCount: 0,
        ignoredCount: 0,
      },
      startedAt: null,
    };
  }

  return getWebhookManager().getStatus();
}
