'use client';

import { useTranslation } from 'react-i18next';
import { Server, Link2, Unlink } from 'lucide-react';
import { BaseDrawer } from '@/components/common/base-drawer/base-drawer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClusterStatusBadge } from './cluster-status-badge';
import type { ClusterStatus } from '@shepai/core/domain/generated/output';

export interface LinkedEntity {
  id: string;
  name: string;
}

export interface ClusterDetailData {
  id: string;
  name: string;
  description?: string;
  status: ClusterStatus;
  kubeconfigPath?: string;
  argoCdEnabled?: boolean;
  argoCdNamespace?: string;
  lastProvisionedAt?: string;
  lastHealthCheckAt?: string;
  errorMessage?: string;
  linkedRepos: LinkedEntity[];
  linkedApps: LinkedEntity[];
}

export interface ClusterDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  cluster: ClusterDetailData | null;
  onProvision?: (id: string) => void;
  onDestroy?: (id: string) => void;
  onUnlinkRepo?: (clusterId: string, repoId: string) => void;
  onUnlinkApp?: (clusterId: string, appId: string) => void;
}

export function ClusterDetailDrawer({
  open,
  onClose,
  cluster,
  onProvision,
  onDestroy,
  onUnlinkRepo,
  onUnlinkApp,
}: ClusterDetailDrawerProps) {
  const { t } = useTranslation('web');

  if (!cluster) return null;

  const canProvision = cluster.status === 'Stopped' || cluster.status === 'Error';
  const canDestroy = cluster.status === 'Ready' || cluster.status === 'Error';

  return (
    <BaseDrawer
      open={open}
      onClose={onClose}
      title={cluster.name}
      size="md"
      data-testid="cluster-detail-drawer"
      header={
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
            <Server className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold" data-testid="cluster-detail-name">
              {cluster.name}
            </h2>
            {cluster.description ? (
              <p className="text-muted-foreground truncate text-sm">{cluster.description}</p>
            ) : null}
          </div>
          <ClusterStatusBadge status={cluster.status} />
        </div>
      }
      footer={
        <div className="flex gap-2">
          {canProvision && onProvision ? (
            <Button
              data-testid="cluster-detail-provision"
              onClick={() => onProvision(cluster.id)}
              className="flex-1"
            >
              {t('cluster.provision')}
            </Button>
          ) : null}
          {canDestroy && onDestroy ? (
            <Button
              data-testid="cluster-detail-destroy"
              variant="destructive"
              onClick={() => onDestroy(cluster.id)}
              className="flex-1"
            >
              {t('cluster.destroy')}
            </Button>
          ) : null}
        </div>
      }
    >
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 shrink-0">
          <TabsTrigger value="overview" data-testid="cluster-detail-tab-overview">
            {t('cluster.tabOverview')}
          </TabsTrigger>
          <TabsTrigger value="repositories" data-testid="cluster-detail-tab-repos">
            {t('cluster.tabRepositories')}
          </TabsTrigger>
          <TabsTrigger value="applications" data-testid="cluster-detail-tab-apps">
            {t('cluster.tabApplications')}
          </TabsTrigger>
          <TabsTrigger value="status" data-testid="cluster-detail-tab-status">
            {t('cluster.tabStatus')}
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="overview" className="p-4">
            <OverviewTab cluster={cluster} />
          </TabsContent>

          <TabsContent value="repositories" className="p-4">
            <LinkedEntitiesTab
              entities={cluster.linkedRepos}
              emptyMessage={t('cluster.noLinkedRepos')}
              onUnlink={onUnlinkRepo ? (entityId) => onUnlinkRepo(cluster.id, entityId) : undefined}
            />
          </TabsContent>

          <TabsContent value="applications" className="p-4">
            <LinkedEntitiesTab
              entities={cluster.linkedApps}
              emptyMessage={t('cluster.noLinkedApps')}
              onUnlink={onUnlinkApp ? (entityId) => onUnlinkApp(cluster.id, entityId) : undefined}
            />
          </TabsContent>

          <TabsContent value="status" className="p-4">
            <StatusTab cluster={cluster} />
          </TabsContent>
        </div>
      </Tabs>
    </BaseDrawer>
  );
}

function OverviewTab({ cluster }: { cluster: ClusterDetailData }) {
  const { t } = useTranslation('web');

  return (
    <div className="flex flex-col gap-3">
      <DetailRow label={t('cluster.fieldStatus')}>
        <ClusterStatusBadge status={cluster.status} />
      </DetailRow>
      {cluster.kubeconfigPath ? (
        <DetailRow label={t('cluster.fieldKubeconfig')}>
          <code className="text-xs break-all">{cluster.kubeconfigPath}</code>
        </DetailRow>
      ) : null}
      <DetailRow label={t('cluster.fieldArgoCd')}>
        <span className="text-sm">
          {cluster.argoCdEnabled ? t('cluster.enabled') : t('cluster.disabled')}
        </span>
      </DetailRow>
      {cluster.argoCdEnabled && cluster.argoCdNamespace ? (
        <DetailRow label={t('cluster.fieldArgoCdNamespace')}>
          <code className="text-xs">{cluster.argoCdNamespace}</code>
        </DetailRow>
      ) : null}
      {cluster.lastProvisionedAt ? (
        <DetailRow label={t('cluster.fieldLastProvisioned')}>
          <span className="text-sm">{cluster.lastProvisionedAt}</span>
        </DetailRow>
      ) : null}
      {cluster.lastHealthCheckAt ? (
        <DetailRow label={t('cluster.fieldLastHealthCheck')}>
          <span className="text-sm">{cluster.lastHealthCheckAt}</span>
        </DetailRow>
      ) : null}
      {cluster.errorMessage ? (
        <DetailRow label={t('cluster.fieldError')}>
          <span className="text-sm text-red-600 dark:text-red-400">{cluster.errorMessage}</span>
        </DetailRow>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <div className="text-end">{children}</div>
    </div>
  );
}

function LinkedEntitiesTab({
  entities,
  emptyMessage,
  onUnlink,
}: {
  entities: LinkedEntity[];
  emptyMessage: string;
  onUnlink?: (entityId: string) => void;
}) {
  if (entities.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entities.map((entity) => (
        <div
          key={entity.id}
          className="flex items-center justify-between rounded-md border px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Link2 className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-sm">{entity.name}</span>
          </div>
          {onUnlink ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onUnlink(entity.id)}
              aria-label={`Unlink ${entity.name}`}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StatusTab({ cluster }: { cluster: ClusterDetailData }) {
  const { t } = useTranslation('web');

  if (cluster.status !== 'Ready') {
    return <p className="text-muted-foreground text-sm">{t('cluster.statusNotAvailable')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t('cluster.statusLive')}</p>
    </div>
  );
}
