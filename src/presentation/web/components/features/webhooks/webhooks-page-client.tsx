'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page-header';
import { WebhookStatusCards } from './webhook-status-cards';
import { WebhookRepoList } from './webhook-repo-list';
import { WebhookDeliveryTable } from './webhook-delivery-table';
import type { WebhookSystemStatus, WebhookDeliveryRecord } from './types';

export interface WebhooksPageClientProps {
  initialStatus: WebhookSystemStatus;
}

export function WebhooksPageClient({ initialStatus }: WebhooksPageClientProps) {
  const [status, setStatus] = useState<WebhookSystemStatus>(initialStatus);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statusRes, deliveriesRes] = await Promise.all([
        fetch('/api/webhooks/status'),
        fetch('/api/webhooks/deliveries?limit=100'),
      ]);
      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      if (deliveriesRes.ok) {
        const data = await deliveriesRes.json();
        setDeliveries(data.deliveries);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Monitor GitHub webhook deliveries and tunnel status"
      >
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refresh
        </Button>
      </PageHeader>

      <WebhookStatusCards status={status} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WebhookRepoList
            webhooks={status.webhooks.registered}
            tunnelUrl={status.tunnel.publicUrl}
          />
        </div>
        <div className="lg:col-span-2">
          <WebhookDeliveryTable deliveries={deliveries} />
        </div>
      </div>
    </div>
  );
}
