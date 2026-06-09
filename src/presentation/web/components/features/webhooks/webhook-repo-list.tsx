'use client';

import { GitBranch, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RegisteredWebhookInfo } from './types';

export interface WebhookRepoListProps {
  webhooks: readonly RegisteredWebhookInfo[];
  tunnelUrl: string | null;
}

export function WebhookRepoList({ webhooks, tunnelUrl }: WebhookRepoListProps) {
  if (webhooks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Registered Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No webhooks registered. Webhooks are automatically created for repositories with
            features in the Review lifecycle when cloudflared is available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Registered Repositories ({webhooks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.webhookId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">{webhook.repoFullName}</p>
                  <p className="text-muted-foreground text-xs">Webhook #{webhook.webhookId}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Active
                </Badge>
                {tunnelUrl ? (
                  <a
                    href={`https://github.com/${webhook.repoFullName}/settings/hooks/${webhook.webhookId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
