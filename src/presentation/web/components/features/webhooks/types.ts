export type WebhookDeliveryStatus = 'success' | 'ignored' | 'error';

export interface WebhookDeliveryRecord {
  deliveryId: string;
  eventType: string;
  source: string;
  receivedAt: string;
  status: WebhookDeliveryStatus;
  statusMessage: string;
  durationMs: number;
  payload: Record<string, unknown>;
}

export interface RegisteredWebhookInfo {
  repoFullName: string;
  webhookId: number;
  repositoryPath: string;
}

export interface WebhookSystemStatus {
  running: boolean;
  tunnel: {
    connected: boolean;
    publicUrl: string | null;
  };
  webhooks: {
    registered: readonly RegisteredWebhookInfo[];
    totalDeliveries: number;
    successCount: number;
    errorCount: number;
    ignoredCount: number;
  };
  startedAt: string | null;
}
