import { loadWebhookStatus } from '@/app/actions/load-webhook-status';
import { WebhooksPageClient } from '@/components/features/webhooks/webhooks-page-client';

/** Skip static pre-rendering since we need runtime webhook manager. */
export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const status = await loadWebhookStatus();

  return (
    <div className="flex h-full flex-col px-6 pb-6">
      <WebhooksPageClient initialStatus={status} />
    </div>
  );
}
