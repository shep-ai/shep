'use client';

import { Activity, Globe, Webhook, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WebhookSystemStatus } from './types';

export interface WebhookStatusCardsProps {
  status: WebhookSystemStatus;
}

export function WebhookStatusCards({ status }: WebhookStatusCardsProps) {
  const uptime = status.startedAt ? formatUptime(new Date(status.startedAt)) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* System Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Status</CardTitle>
          <Activity className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div
              className={cn('h-2 w-2 rounded-full', status.running ? 'bg-green-500' : 'bg-red-500')}
            />
            <span className="text-2xl font-bold">{status.running ? 'Active' : 'Inactive'}</span>
          </div>
          {uptime ? (
            <p className="text-muted-foreground text-xs">Up for {uptime}</p>
          ) : (
            <p className="text-muted-foreground text-xs">Webhook system not started</p>
          )}
        </CardContent>
      </Card>

      {/* Tunnel Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tunnel</CardTitle>
          <Globe className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={status.tunnel.connected ? 'default' : 'destructive'}>
              {status.tunnel.connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          {status.tunnel.publicUrl ? (
            <p
              className="text-muted-foreground mt-1 truncate text-xs"
              title={status.tunnel.publicUrl}
            >
              {status.tunnel.publicUrl}
            </p>
          ) : (
            <p className="text-muted-foreground mt-1 text-xs">No tunnel URL</p>
          )}
        </CardContent>
      </Card>

      {/* Registered Webhooks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Webhooks</CardTitle>
          <Webhook className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{status.webhooks.registered.length}</div>
          <p className="text-muted-foreground text-xs">
            {status.webhooks.registered.length === 1 ? 'repository' : 'repositories'} registered
          </p>
        </CardContent>
      </Card>

      {/* Delivery Stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Deliveries</CardTitle>
          <CheckCircle className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{status.webhooks.totalDeliveries}</div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {status.webhooks.successCount}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {status.webhooks.errorCount}
            </span>
            <span className="flex items-center gap-1">
              <MinusCircle className="h-3 w-3 text-yellow-500" />
              {status.webhooks.ignoredCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatUptime(startedAt: Date): string {
  const ms = Date.now() - startedAt.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
