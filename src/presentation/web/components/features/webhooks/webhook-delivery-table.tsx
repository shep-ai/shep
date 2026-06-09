'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { WebhookDeliveryRecord, WebhookDeliveryStatus } from './types';

export interface WebhookDeliveryTableProps {
  deliveries: WebhookDeliveryRecord[];
}

const STATUS_ICON: Record<WebhookDeliveryStatus, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  ignored: <MinusCircle className="h-4 w-4 text-yellow-500" />,
};

const STATUS_LABEL: Record<WebhookDeliveryStatus, string> = {
  success: 'Success',
  error: 'Error',
  ignored: 'Ignored',
};

export function WebhookDeliveryTable({ deliveries }: WebhookDeliveryTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const eventTypes = [...new Set(deliveries.map((d) => d.eventType))];

  const filtered = deliveries.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (eventTypeFilter !== 'all' && d.eventType !== eventTypeFilter) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Delivery History ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {eventTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No delivery records yet. Webhook events will appear here when received.
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((delivery) => (
              <DeliveryRow
                key={delivery.deliveryId}
                delivery={delivery}
                expanded={expandedId === delivery.deliveryId}
                onToggle={() =>
                  setExpandedId(expandedId === delivery.deliveryId ? null : delivery.deliveryId)
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryRow({
  delivery,
  expanded,
  onToggle,
}: {
  delivery: WebhookDeliveryRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const time = new Date(delivery.receivedAt);
  const timeStr = time.toLocaleTimeString();
  const dateStr = time.toLocaleDateString();

  return (
    <div className={cn('rounded-lg border', expanded && 'bg-muted/50')}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {STATUS_ICON[delivery.status]}
        <Badge variant="outline" className="text-xs">
          {delivery.eventType}
        </Badge>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {delivery.deliveryId}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">{delivery.durationMs}ms</span>
        <span className="text-muted-foreground shrink-0 text-xs">{timeStr}</span>
      </button>
      {expanded ? (
        <div className="border-t px-3 py-3">
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Status:</span>{' '}
              <Badge
                variant={delivery.status === 'error' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {STATUS_LABEL[delivery.status]}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span> {dateStr} {timeStr}
            </div>
            <div>
              <span className="text-muted-foreground">Duration:</span> {delivery.durationMs}ms
            </div>
            <div>
              <span className="text-muted-foreground">Source:</span> {delivery.source}
            </div>
          </div>
          <div className="mb-2">
            <span className="text-muted-foreground text-xs">Message:</span>
            <p className="text-sm">{delivery.statusMessage}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Payload:</span>
            <pre className="bg-muted mt-1 max-h-60 overflow-auto rounded-md p-2 text-xs">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
