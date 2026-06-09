/**
 * Disable Webhook for Repo: POST /api/webhooks/repos/disable
 *
 * Body: { repositoryPath: string }
 * Removes the GitHub webhook for the given repository.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: { repositoryPath?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repositoryPath } = body;
  if (!repositoryPath) {
    return Response.json({ success: false, error: 'repositoryPath is required' }, { status: 400 });
  }

  if (!hasWebhookManager()) {
    return Response.json(
      { success: false, error: 'Webhook system not initialized' },
      { status: 503 }
    );
  }

  const manager = getWebhookManager();
  const result = await manager.disableWebhookForRepo(repositoryPath);
  return Response.json(result);
}
