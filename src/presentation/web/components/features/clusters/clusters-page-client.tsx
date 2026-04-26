'use client';

import { useCallback, useState } from 'react';
import { Loader2, Plus, Server } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ClusterCreateDrawer } from '@/components/common/cluster-node/cluster-create-drawer';
import { ClusterDetailDrawer } from '@/components/common/cluster-node/cluster-detail-drawer';
import type { ClusterDetailData } from '@/components/common/cluster-node/cluster-detail-drawer';
import { ClusterStatusBadge } from '@/components/common/cluster-node/cluster-status-badge';
import {
  createCluster,
  deleteCluster,
  destroyCluster,
  provisionCluster,
} from '@/app/actions/cluster';
import type { Cluster } from '@shepai/core/domain/generated/output';
import { ClusterStatus } from '@shepai/core/domain/generated/output';

export interface ClustersPageClientProps {
  initialClusters: Cluster[];
  className?: string;
}

const CLUSTERS_QUERY_KEY = ['clusters'] as const;

export function ClustersPageClient({ initialClusters, className }: ClustersPageClientProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const { data: clusters = initialClusters, isFetching } = useQuery<Cluster[]>({
    queryKey: CLUSTERS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/clusters');
      if (!res.ok) throw new Error('Failed to fetch clusters');
      return res.json();
    },
    initialData: initialClusters,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CLUSTERS_QUERY_KEY });
  }, [queryClient]);

  const handleCreate = useCallback(
    async (input: { name: string; description?: string; argoCdEnabled: boolean }) => {
      setCreateSubmitting(true);
      try {
        const result = await createCluster(input);
        if (result.error || !result.cluster) {
          toast.error(result.error ?? 'Failed to create cluster');
          return;
        }
        toast.success(`Cluster "${result.cluster.name}" created`);
        // Kick off provisioning right after creation — matches CLI `--provision` flag UX.
        const provisionResult = await provisionCluster(result.cluster.id);
        if (provisionResult.error) {
          toast.error(`Created, but provisioning failed: ${provisionResult.error}`);
        } else {
          toast.success(`Provisioning "${result.cluster.name}"…`);
        }
        setCreateOpen(false);
        refresh();
      } finally {
        setCreateSubmitting(false);
      }
    },
    [refresh]
  );

  const handleProvision = useCallback(
    async (id: string) => {
      const result = await provisionCluster(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Provisioning started');
      refresh();
    },
    [refresh]
  );

  const handleDestroy = useCallback(
    async (id: string) => {
      const cluster = clusters.find((c) => c.id === id);
      if (!cluster) return;
      const ok = window.confirm(
        `Destroy cluster "${cluster.name}"? This stops the k3s container and cannot be undone.`
      );
      if (!ok) return;
      const result = await destroyCluster(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Destroying "${cluster.name}"…`);
      refresh();
    },
    [clusters, refresh]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const cluster = clusters.find((c) => c.id === id);
      if (!cluster) return;
      const ok = window.confirm(
        `Delete cluster "${cluster.name}"? The cluster entity will be removed. If it is running it will be destroyed first.`
      );
      if (!ok) return;
      const result = await deleteCluster(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${cluster.name}"`);
      setSelectedClusterId(null);
      refresh();
    },
    [clusters, refresh]
  );

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;
  const selectedDetail: ClusterDetailData | null = selectedCluster
    ? {
        id: selectedCluster.id,
        name: selectedCluster.name,
        description: selectedCluster.description,
        status: selectedCluster.status,
        kubeconfigPath: selectedCluster.kubeconfigPath,
        argoCdEnabled: selectedCluster.argoCdEnabled,
        argoCdNamespace: selectedCluster.argoCdNamespace,
        lastProvisionedAt:
          selectedCluster.lastProvisionedAt != null
            ? String(selectedCluster.lastProvisionedAt)
            : undefined,
        lastHealthCheckAt:
          selectedCluster.lastHealthCheckAt != null
            ? String(selectedCluster.lastHealthCheckAt)
            : undefined,
        errorMessage: selectedCluster.errorMessage,
        linkedRepos: [],
        linkedApps: [],
      }
    : null;

  return (
    <div data-testid="clusters-page-client" className={cn('relative space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Server className="text-muted-foreground h-4 w-4" />
        <h1 className="text-sm font-bold tracking-tight">Clusters</h1>
        <span className="text-muted-foreground text-[10px]">
          {clusters.length} {clusters.length === 1 ? 'cluster' : 'clusters'}
        </span>
        {isFetching ? <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" /> : null}
        <div className="ms-auto">
          <Button
            data-testid="clusters-page-new-button"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="me-1 h-4 w-4" />
            New cluster
          </Button>
        </div>
      </div>

      {clusters.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div
          data-testid="clusters-page-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {clusters.map((cluster) => (
            <ClusterListCard
              key={cluster.id}
              cluster={cluster}
              onClick={() => setSelectedClusterId(cluster.id)}
              onProvision={() => handleProvision(cluster.id)}
              onDestroy={() => handleDestroy(cluster.id)}
              onDelete={() => handleDelete(cluster.id)}
            />
          ))}
        </div>
      )}

      <ClusterCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        loading={createSubmitting}
      />

      <ClusterDetailDrawer
        open={selectedClusterId !== null}
        onClose={() => setSelectedClusterId(null)}
        cluster={selectedDetail}
        onProvision={handleProvision}
        onDestroy={handleDestroy}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-testid="clusters-page-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500">
        <Server className="h-6 w-6 text-white" />
      </div>
      <h2 className="text-base font-semibold">No clusters yet</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        Spin up a local k3s Kubernetes cluster in Docker. Shep will provision it, configure kubectl,
        and optionally install ArgoCD.
      </p>
      <Button data-testid="clusters-page-empty-create" size="sm" onClick={onCreate}>
        <Plus className="me-1 h-4 w-4" />
        Create your first cluster
      </Button>
    </div>
  );
}

interface ClusterListCardProps {
  cluster: Cluster;
  onClick: () => void;
  onProvision: () => void;
  onDestroy: () => void;
  onDelete: () => void;
}

function ClusterListCard({
  cluster,
  onClick,
  onProvision,
  onDestroy,
  onDelete,
}: ClusterListCardProps) {
  const canProvision =
    cluster.status === ClusterStatus.Stopped || cluster.status === ClusterStatus.Error;
  const canDestroy =
    cluster.status === ClusterStatus.Ready || cluster.status === ClusterStatus.Error;

  return (
    <div
      data-testid="cluster-list-card"
      data-cluster-id={cluster.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-card hover:border-primary/40 flex cursor-pointer flex-col gap-3 rounded-xl border p-4 shadow-sm transition-colors dark:bg-neutral-800/80"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
          <Server className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{cluster.name}</h3>
            <ClusterStatusBadge status={cluster.status} className="ms-auto" />
          </div>
          {cluster.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{cluster.description}</p>
          ) : (
            <p className="text-muted-foreground mt-1 text-xs italic">No description</p>
          )}
        </div>
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
        <span>ArgoCD: {cluster.argoCdEnabled ? 'on' : 'off'}</span>
        {cluster.k3dClusterName ? (
          <span className="truncate">k3d: {cluster.k3dClusterName}</span>
        ) : null}
      </div>

      {cluster.errorMessage ? (
        <p className="text-destructive line-clamp-2 text-xs" data-testid="cluster-list-card-error">
          {cluster.errorMessage}
        </p>
      ) : null}

      <div
        className="flex flex-wrap gap-2 pt-1"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {canProvision ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="cluster-list-card-provision"
            onClick={onProvision}
          >
            Provision
          </Button>
        ) : null}
        {canDestroy ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="cluster-list-card-destroy"
            onClick={onDestroy}
          >
            Destroy
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive ms-auto"
          data-testid="cluster-list-card-delete"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
