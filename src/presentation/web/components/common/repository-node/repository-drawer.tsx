'use client';

import { useCallback } from 'react';
import { Code2, Terminal, FolderOpen, RefreshCw, Radio } from 'lucide-react';
import { BaseDrawer } from '@/components/common/base-drawer';
import { DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ActionButton } from '@/components/common/action-button';
import { useWebhookAction } from '@/hooks/use-webhook-action';
import type { RepositoryNodeData } from './repository-node-config';
import { useRepositoryActions } from './use-repository-actions';
import { SecurityPanel } from './security-panel';
import type { SecurityEvent } from '@shepai/core/domain/generated/output';

export interface RepositoryDrawerProps {
  data: RepositoryNodeData | null;
  onClose: () => void;
  securityEvents?: SecurityEvent[];
}

export function RepositoryDrawer({ data, onClose, securityEvents }: RepositoryDrawerProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const actions = useRepositoryActions(
    data?.repositoryPath ? { repositoryId: data.id, repositoryPath: data.repositoryPath } : null
  );
  const webhookAction = useWebhookAction(data?.repositoryPath ?? null);

  const webhookLabel = !webhookAction.tunnelConnected
    ? 'Webhook unavailable \u2014 tunnel not running'
    : webhookAction.enabled
      ? 'Disable Webhook'
      : 'Enable Webhook';

  return (
    <BaseDrawer
      open={data !== null}
      onClose={handleClose}
      size="md"
      modal={false}
      data-testid="repository-drawer"
      deployTarget={
        data?.repositoryPath
          ? {
              targetId: data.repositoryPath,
              targetType: 'repository',
              repositoryPath: data.repositoryPath,
            }
          : undefined
      }
      header={
        data ? (
          <div data-testid="repository-drawer-header">
            <DrawerTitle>{data.name}</DrawerTitle>
            {data.repositoryPath ? (
              <DrawerDescription className="truncate font-mono text-xs">
                {data.repositoryPath}
              </DrawerDescription>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {data?.repositoryPath ? (
        <>
          <Separator />
          <div className="flex flex-col gap-3 p-4">
            <div className="text-muted-foreground text-xs font-semibold tracking-wider">
              OPEN WITH
            </div>
            <div className="flex flex-col gap-2">
              <ActionButton
                label="Open in IDE"
                onClick={actions.openInIde}
                loading={actions.ideLoading}
                error={!!actions.ideError}
                icon={Code2}
                variant="outline"
                size="sm"
              />
              <ActionButton
                label="Open in Shell"
                onClick={actions.openInShell}
                loading={actions.shellLoading}
                error={!!actions.shellError}
                icon={Terminal}
                variant="outline"
                size="sm"
              />
              <ActionButton
                label="Open Folder"
                onClick={actions.openFolder}
                loading={actions.folderLoading}
                error={!!actions.folderError}
                icon={FolderOpen}
                variant="outline"
                size="sm"
              />
            </div>
          </div>
          {data.id ? (
            <>
              <Separator />
              <div className="flex flex-col gap-3 p-4">
                <div className="text-muted-foreground text-xs font-semibold tracking-wider">
                  GIT OPERATIONS
                </div>
                <div className="flex flex-col gap-2">
                  <ActionButton
                    label="Sync Main"
                    onClick={actions.syncMain}
                    loading={actions.syncLoading}
                    error={!!actions.syncError}
                    icon={RefreshCw}
                    variant="outline"
                    size="sm"
                  />
                  {actions.syncError ? (
                    <p className="text-destructive text-xs">{actions.syncError}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
          {securityEvents != null && securityEvents.length >= 0 ? (
            <>
              <Separator />
              <div className="flex flex-col gap-3 p-4">
                <SecurityPanel events={securityEvents} />
              </div>
            </>
          ) : null}
          <Separator />
          <div className="flex flex-col gap-3 p-4">
            <div className="text-muted-foreground text-xs font-semibold tracking-wider">
              WEBHOOKS
            </div>
            <div className="flex flex-col gap-2">
              <ActionButton
                label={webhookLabel}
                onClick={webhookAction.toggle}
                loading={webhookAction.loading}
                error={!!webhookAction.error}
                icon={Radio}
                variant="outline"
                size="sm"
                disabled={!webhookAction.tunnelConnected}
                className={
                  webhookAction.enabled && !webhookAction.error
                    ? 'border-green-500/30 text-green-500 hover:text-green-600'
                    : undefined
                }
              />
              {webhookAction.enabled && webhookAction.webhookId ? (
                <div className="flex flex-col gap-2">
                  <div className="text-muted-foreground text-xs">
                    Webhook #{webhookAction.webhookId}
                    {webhookAction.repoFullName ? ` on ${webhookAction.repoFullName}` : ''}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['pull_request', 'check_suite', 'check_run'].map((event) => (
                      <Badge key={event} variant="secondary" className="text-xs">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </BaseDrawer>
  );
}
