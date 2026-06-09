/**
 * Per-Repo Webhook Status: GET /api/webhooks/repos/status?repositoryPath=...
 *
 * Returns whether a webhook is enabled for a specific repository.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const repositoryPath = searchParams.get('repositoryPath');

  if (!repositoryPath) {
    return Response.json({ error: 'repositoryPath query parameter is required' }, { status: 400 });
  }

  if (!hasWebhookManager()) {
    return Response.json({ enabled: false });
  }

  const manager = getWebhookManager();
  const webhook = manager.getWebhookForRepo(repositoryPath);

  if (!webhook) {
    return Response.json({ enabled: false });
  }

  return Response.json({
    enabled: true,
    webhookId: webhook.webhookId,
    repoFullName: webhook.repoFullName,
  });
}
