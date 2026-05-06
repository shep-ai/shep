'use client';

import React, { useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  SlidersHorizontal,
  Archive,
  Inbox,
  X,
  ArrowDownAZ,
  ArrowUpAZ,
  FolderPlus,
  FolderOpen,
  Sparkles,
  LayoutGrid,
  GitBranch,
  Github,
} from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { FeatureTreeTable } from '@/components/features/feature-tree-table';
import type {
  FeatureTreeRow,
  InventoryRepo,
  GroupByField,
  SortDir,
} from '@/components/features/feature-tree-table';
import { FeatureRowActionsManager } from '@/components/features/feature-tree-table/feature-row-actions-manager';
import { RepositoryGroupActionsManager } from '@/components/features/feature-tree-table/repository-group-actions';
import type { RepoActionCallbacks } from '@/components/features/feature-tree-table/repository-group-actions';
import { ApplicationRowActionsManager } from '@/components/features/feature-tree-table/application-row-actions-manager';
import { DeleteFeatureDialog } from '@/components/common/delete-feature-dialog/delete-feature-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import {
  FloatingActionButton,
  type FloatingActionButtonAction,
} from '@/components/common/floating-action-button';
import { FeatureCreateDrawer } from '@/components/common/feature-create-drawer';
import type { FeatureCreatePayload } from '@/components/common/feature-create-drawer';
import { NewProjectDialog } from '@/components/features/control-center/new-project-dialog';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { archiveFeature } from '@/app/actions/archive-feature';
import { unarchiveFeature } from '@/app/actions/unarchive-feature';
import { deleteFeature } from '@/app/actions/delete-feature';
import { startFeature } from '@/app/actions/start-feature';
import { stopFeature } from '@/app/actions/stop-feature';
import { resumeFeature } from '@/app/actions/resume-feature';
import { createFeature } from '@/app/actions/create-feature';
import { addRepository } from '@/app/actions/add-repository';
import { openIde } from '@/app/actions/open-ide';
import { openShell } from '@/app/actions/open-shell';
import { openFolder } from '@/app/actions/open-folder';
import { deployRepository } from '@/app/actions/deploy-repository';
import { stopDeployment } from '@/app/actions/stop-deployment';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import type { InventoryCreateData } from './get-feature-tree-data';
import { useSidebar } from '@/components/ui/sidebar';
import { useFabLayout } from '@/hooks/fab-layout-context';

export interface FeatureTreePageClientProps {
  /** Combined feature + application rows shown in the inventory table. */
  rows: FeatureTreeRow[];
  repos: InventoryRepo[];
  createData: InventoryCreateData;
  initialDeployments?: DeploymentStatusEntry[];
}

const STATUS_LABELS: Record<FeatureStatus, string> = {
  'action-needed': 'Action Needed',
  'in-progress': 'In Progress',
  pending: 'Pending',
  blocked: 'Blocked',
  error: 'Error',
  done: 'Done',
};

const STATUS_COLORS: Record<FeatureStatus, string> = {
  'action-needed': 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
  'in-progress': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
  pending: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/20',
  blocked: 'bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/20',
  error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

type ArchiveFilter = 'active' | 'archived' | 'all';

const GROUP_BY_LABELS: Record<GroupByField, string> = {
  repositoryName: 'Repository',
  status: 'Status',
  lifecycle: 'Lifecycle',
};

const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: '__none__', label: 'No grouping' },
  { value: 'repositoryName', label: 'Repository' },
  { value: 'status', label: 'Status' },
  { value: 'lifecycle', label: 'Lifecycle' },
];

/** Item sort fields change based on groupBy — exclude the grouped field. */
export function getItemSortOptions(groupBy: GroupByField | null) {
  const all = [
    { value: 'name', label: 'Name' },
    { value: 'repositoryName', label: 'Repository' },
    { value: 'status', label: 'Status' },
    { value: 'lifecycle', label: 'Lifecycle' },
    { value: 'branch', label: 'Branch' },
  ];
  if (!groupBy) return all;
  return all.filter((o) => o.value !== groupBy);
}

export function isArchived(feature: FeatureTreeRow): boolean {
  return feature.lifecycle === 'Archived';
}

interface DeleteTarget {
  featureId: string;
  featureName: string;
  hasChildren: boolean;
  hasOpenPr: boolean;
}

interface ArchiveTarget {
  featureId: string;
  featureName: string;
}

export function FeatureTreePageClient({
  rows,
  repos,
  createData,
  initialDeployments = [],
}: FeatureTreePageClientProps) {
  // Features-only view (excludes application rows) — used by status pill counts,
  // repo filter, and the row-actions portal manager which only knows about features.
  const features = useMemo(() => rows.filter((r) => !r._isApplication), [rows]);
  const router = useRouter();
  const { t } = useTranslation('web');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Group + sort state
  const [groupBy, setGroupBy] = useState<GroupByField | null>('repositoryName');
  const [groupSortDir, setGroupSortDir] = useState<SortDir>('asc');
  const [itemSortField, setItemSortField] = useState('name');
  const [itemSortDir, setItemSortDir] = useState<SortDir>('asc');

  // Action wiring state
  const [tableContainer, setTableContainer] = useState<HTMLDivElement | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

  // Create actions state
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [isCreatingFeature, setIsCreatingFeature] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);

  const addInFlight = useCallback((id: string) => {
    setInFlightIds((prev) => new Set(prev).add(id));
  }, []);

  const removeInFlight = useCallback((id: string) => {
    setInFlightIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (row: FeatureTreeRow) => {
      if (row._isApplication && row._applicationId) {
        router.push(`/application/${row._applicationId}`);
        return;
      }
      router.push(`/feature/${row.id}/overview`);
    },
    [router]
  );

  const handleTableRender = useCallback((container: HTMLDivElement) => {
    setTableContainer(container);
    setRenderTick((t) => t + 1);
  }, []);

  // ── Create actions ────────────────────────────────────────────

  // Repo path to pre-fill when creating a feature from a repo group header
  const [createForRepoPath, setCreateForRepoPath] = useState('');

  const handleCreateFeatureForRepo = useCallback((repositoryPath: string) => {
    setCreateForRepoPath(repositoryPath);
    setCreateDrawerOpen(true);
  }, []);

  const handleCreateFeatureSubmit = useCallback(
    (data: FeatureCreatePayload) => {
      setIsCreatingFeature(true);
      setCreateDrawerOpen(false);

      createFeature(data)
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success('Feature created');
          router.refresh();
        })
        .catch(() => {
          toast.error('Failed to create feature');
        })
        .finally(() => {
          setIsCreatingFeature(false);
        });
    },
    [router]
  );

  const handleNewProjectCreated = useCallback(
    (path: string) => {
      addRepository({ path })
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success('Project created');
            router.refresh();
          }
        })
        .catch(() => {
          toast.error('Failed to add project');
        });
    },
    [router]
  );

  const handlePickFolder = useCallback(() => {
    window.dispatchEvent(new CustomEvent('shep:pick-folder'));
  }, []);

  const fabActions = useMemo<FloatingActionButtonAction[]>(() => {
    const actions: FloatingActionButtonAction[] = [
      {
        id: 'new-project',
        label: 'New project',
        icon: <FolderPlus className="h-4 w-4" />,
        onClick: () => setNewProjectOpen(true),
      },
      {
        id: 'new-feature',
        label: t('fab.newFeature'),
        icon: <Sparkles className="h-4 w-4" />,
        onClick: () => {
          setCreateForRepoPath('');
          setCreateDrawerOpen(true);
        },
      },
      {
        id: 'add-local-repo',
        label: t('fab.localFolder'),
        icon: <FolderOpen className="h-4 w-4" />,
        onClick: handlePickFolder,
      },
      {
        id: 'new-application',
        label: t('fab.newApplication'),
        icon: <LayoutGrid className="h-4 w-4" />,
        onClick: () => setShowCreatePrompt(true),
      },
    ];
    actions.push({
      id: 'adopt-branch',
      label: t('fab.adoptBranch'),
      icon: <GitBranch className="h-4 w-4" />,
      onClick: () => router.push('/adopt'),
    });
    actions.push({
      id: 'add-github-repo',
      label: t('fab.fromGithub'),
      icon: <Github className="h-4 w-4" />,
      onClick: () => {
        window.dispatchEvent(new CustomEvent('shep:open-github-import'));
      },
    });
    return actions;
  }, [t, handlePickFolder, router]);

  // ── Action handlers ──────────────────────────────────────────

  const handleStart = useCallback(
    async (featureId: string) => {
      addInFlight(featureId);
      try {
        const result = await startFeature(featureId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Feature started');
        }
      } catch {
        toast.error('Failed to start feature');
      } finally {
        removeInFlight(featureId);
        router.refresh();
      }
    },
    [addInFlight, removeInFlight, router]
  );

  const handleStop = useCallback(
    async (featureId: string) => {
      addInFlight(featureId);
      try {
        const result = await stopFeature(featureId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Feature stopped');
        }
      } catch {
        toast.error('Failed to stop feature');
      } finally {
        removeInFlight(featureId);
        router.refresh();
      }
    },
    [addInFlight, removeInFlight, router]
  );

  const handleRetry = useCallback(
    async (featureId: string) => {
      addInFlight(featureId);
      try {
        const result = await resumeFeature(featureId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Feature resumed');
        }
      } catch {
        toast.error('Failed to resume feature');
      } finally {
        removeInFlight(featureId);
        router.refresh();
      }
    },
    [addInFlight, removeInFlight, router]
  );

  const handleReview = useCallback(
    (featureId: string) => {
      router.push(`/feature/${featureId}/overview`);
    },
    [router]
  );

  const handleUnarchive = useCallback(
    async (featureId: string) => {
      addInFlight(featureId);
      try {
        const result = await unarchiveFeature(featureId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Feature unarchived');
        }
      } catch {
        toast.error('Failed to unarchive feature');
      } finally {
        removeInFlight(featureId);
        router.refresh();
      }
    },
    [addInFlight, removeInFlight, router]
  );

  // Archive opens confirmation dialog
  const handleArchiveRequest = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;
      setArchiveTarget({ featureId, featureName: feature.name });
    },
    [features]
  );

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget) return;
    const { featureId } = archiveTarget;
    setArchiveTarget(null);
    addInFlight(featureId);
    try {
      const result = await archiveFeature(featureId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Feature archived');
      }
    } catch {
      toast.error('Failed to archive feature');
    } finally {
      removeInFlight(featureId);
      router.refresh();
    }
  }, [archiveTarget, addInFlight, removeInFlight, router]);

  // Delete opens DeleteFeatureDialog
  const handleDeleteRequest = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;
      setDeleteTarget({
        featureId,
        featureName: feature.name,
        hasChildren: feature.hasChildren ?? false,
        hasOpenPr: feature.hasOpenPr ?? false,
      });
    },
    [features]
  );

  const handleDeleteConfirm = useCallback(
    async (cleanup: boolean, cascadeDelete: boolean, closePr: boolean) => {
      if (!deleteTarget) return;
      const { featureId } = deleteTarget;
      setDeleteTarget(null);
      addInFlight(featureId);
      try {
        const result = await deleteFeature(featureId, cleanup, cascadeDelete, closePr);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Feature deleted');
        }
      } catch {
        toast.error('Failed to delete feature');
      } finally {
        removeInFlight(featureId);
        router.refresh();
      }
    },
    [deleteTarget, addInFlight, removeInFlight, router]
  );

  // ── Repository action handlers ──────────────────────────────

  const handleRepoOpenIde = useCallback(async (repositoryPath: string) => {
    const result = await openIde({ repositoryPath });
    if (!result.success) {
      toast.error(result.error ?? 'Failed to open IDE');
    }
  }, []);

  const handleRepoOpenShell = useCallback(async (repositoryPath: string) => {
    const result = await openShell({ repositoryPath });
    if (!result.success) {
      toast.error(result.error ?? 'Failed to open terminal');
    }
  }, []);

  const handleRepoOpenFolder = useCallback(async (repositoryPath: string) => {
    const result = await openFolder(repositoryPath);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to open folder');
    }
  }, []);

  const handleRepoStartServer = useCallback(async (repositoryPath: string) => {
    const result = await deployRepository(repositoryPath);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to start server');
    } else {
      toast.success('Server starting...');
    }
  }, []);

  const handleRepoStopServer = useCallback(async (repositoryPath: string) => {
    const result = await stopDeployment(repositoryPath);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to stop server');
    } else {
      toast.success('Server stopped');
    }
  }, []);

  const repoActionCallbacks = useMemo<RepoActionCallbacks>(
    () => ({
      onOpenIde: handleRepoOpenIde,
      onOpenShell: handleRepoOpenShell,
      onOpenFolder: handleRepoOpenFolder,
      onStartServer: handleRepoStartServer,
      onStopServer: handleRepoStopServer,
      isServerRunning: () => false,
    }),
    [
      handleRepoOpenIde,
      handleRepoOpenShell,
      handleRepoOpenFolder,
      handleRepoStartServer,
      handleRepoStopServer,
    ]
  );

  const handleGroupByChange = (value: string) => {
    const next = value === '__none__' ? null : (value as GroupByField);
    setGroupBy(next);
    // Reset item sort if current field matches the new groupBy
    if (next && itemSortField === next) {
      setItemSortField('name');
    }
  };

  // Compute status counts for pills
  const statusCounts = useMemo(() => {
    const counts: Record<FeatureStatus, number> = {
      'action-needed': 0,
      'in-progress': 0,
      pending: 0,
      blocked: 0,
      error: 0,
      done: 0,
    };
    for (const f of features) {
      counts[f.status]++;
    }
    return counts;
  }, [features]);

  // Unique repo names for advanced filter
  const repoNames = useMemo(() => {
    const names = new Set<string>();
    for (const f of features) {
      names.add(f.repositoryName);
    }
    return Array.from(names).sort();
  }, [features]);

  // Filtered features (sorting handled by table)
  const filteredFeatures = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return features.filter((feature) => {
      if (archiveFilter === 'active' && isArchived(feature)) return false;
      if (archiveFilter === 'archived' && !isArchived(feature)) return false;
      if (statusFilter && feature.status !== statusFilter) return false;
      if (repoFilter && feature.repositoryName !== repoFilter) return false;
      if (query) {
        const matchesName = feature.name.toLowerCase().includes(query);
        const matchesBranch = feature.branch.toLowerCase().includes(query);
        const matchesRepo = feature.repositoryName.toLowerCase().includes(query);
        if (!matchesName && !matchesBranch && !matchesRepo) return false;
      }
      return true;
    });
  }, [features, searchQuery, statusFilter, archiveFilter, repoFilter]);

  const hasActiveFilters =
    searchQuery !== '' ||
    statusFilter !== null ||
    archiveFilter !== 'active' ||
    repoFilter !== null;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter(null);
    setArchiveFilter('active');
    setRepoFilter(null);
  };

  const archivedCount = useMemo(() => features.filter(isArchived).length, [features]);
  const activeCount = features.length - archivedCount;

  const itemSortOptions = useMemo(() => getItemSortOptions(groupBy), [groupBy]);

  // Combined inventory rows (features + applications) passed through the same
  // filters as features. Apps don't have an SDLC lifecycle, so the "active"
  // archive filter keeps them visible (no archive concept yet for apps).
  const filteredRows = useMemo(() => {
    const featureIdsAfterFilter = new Set(filteredFeatures.map((f) => f.id));
    const query = searchQuery.toLowerCase();
    const filteredApps = rows.filter((row) => {
      if (!row._isApplication) return false;
      if (archiveFilter === 'archived') return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (repoFilter && row.repositoryName !== repoFilter) return false;
      if (query) {
        const matchesName = row.name.toLowerCase().includes(query);
        const matchesRepo = row.repositoryName.toLowerCase().includes(query);
        if (!matchesName && !matchesRepo) return false;
      }
      return true;
    });
    const filteredFeatureRows = rows.filter(
      (r) => !r._isApplication && featureIdsAfterFilter.has(r.id)
    );
    return [...filteredApps, ...filteredFeatureRows];
  }, [rows, filteredFeatures, archiveFilter, statusFilter, repoFilter, searchQuery]);

  const applicationCount = useMemo(
    () => filteredRows.filter((r) => r._isApplication).length,
    [filteredRows]
  );

  return (
    <DeploymentStatusProvider initialDeployments={initialDeployments}>
      <div data-testid="feature-tree-page" className="flex h-full flex-col gap-4">
        <PageHeader title="Inventory" description="All applications, repositories and features" />

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          {/* Row 1: Search + Group By + Filters toggle */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by name, branch, or repository..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            {/* Group By */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
                Group by:
              </span>
              <Select value={groupBy ?? '__none__'} onValueChange={handleGroupByChange}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filters toggle */}
            <Button
              variant={showAdvanced ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className="shrink-0"
            >
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              Filters
            </Button>
          </div>

          {/* Row 2: Archive toggle + Status pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Archive toggle */}
            <div className="border-input flex items-center rounded-md border">
              <button
                onClick={() => setArchiveFilter('active')}
                className={`flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  archiveFilter === 'active'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <Inbox className="size-3.5" />
                Active
                <span className="opacity-70">({activeCount})</span>
              </button>
              <button
                onClick={() => setArchiveFilter('archived')}
                className={`flex items-center gap-1.5 border-x px-3 py-1.5 text-xs font-medium transition-colors ${
                  archiveFilter === 'archived'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <Archive className="size-3.5" />
                Archived
                <span className="opacity-70">({archivedCount})</span>
              </button>
              <button
                onClick={() => setArchiveFilter('all')}
                className={`rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  archiveFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                All
              </button>
            </div>

            <div className="bg-border h-6 w-px" />

            {/* Status filter pills */}
            <button
              onClick={() => setStatusFilter(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === null
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              All Status
            </button>
            {(Object.entries(STATUS_LABELS) as [FeatureStatus, string][]).map(([status, label]) => {
              const count = statusCounts[status];
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? STATUS_COLORS[status]
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}

            {hasActiveFilters ? (
              <>
                <div className="bg-border h-6 w-px" />
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="mr-1 size-3" />
                  Clear
                </Button>
              </>
            ) : null}
          </div>

          {/* Row 3: Sort controls (when grouped) */}
          {groupBy ? (
            <div className="flex flex-wrap items-center gap-3">
              {/* Group sort */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  {GROUP_BY_LABELS[groupBy!]}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setGroupSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  {groupSortDir === 'asc' ? (
                    <ArrowDownAZ className="size-3.5" />
                  ) : (
                    <ArrowUpAZ className="size-3.5" />
                  )}
                  {groupSortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              </div>

              <div className="bg-border h-5 w-px" />

              {/* Item sort */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">Sort by</span>
                <Select value={itemSortField} onValueChange={setItemSortField}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itemSortOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setItemSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  {itemSortDir === 'asc' ? (
                    <ArrowDownAZ className="size-3.5" />
                  ) : (
                    <ArrowUpAZ className="size-3.5" />
                  )}
                  {itemSortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Row 4: Advanced filters (collapsible) */}
          {showAdvanced ? (
            <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium">Repository</span>
                <Select
                  value={repoFilter ?? '__all__'}
                  onValueChange={(v) => setRepoFilter(v === '__all__' ? null : v)}
                >
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="All repositories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All repositories</SelectItem>
                    {repoNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        {/* Quick actions toolbar + results count */}
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>
              {applicationCount} app{applicationCount !== 1 ? 's' : ''} · {filteredFeatures.length}{' '}
              feature{filteredFeatures.length !== 1 ? 's' : ''}
            </span>
            {hasActiveFilters ? (
              <Badge variant="secondary" className="text-xs">
                filtered
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setNewProjectOpen(true)}
            >
              <FolderPlus className="size-3.5" />
              New project
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setCreateForRepoPath('');
                setCreateDrawerOpen(true);
              }}
            >
              <Sparkles className="size-3.5" />
              New feature
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handlePickFolder}
            >
              <FolderOpen className="size-3.5" />
              Add local repo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowCreatePrompt(true)}
            >
              <LayoutGrid className="size-3.5" />
              New application
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('shep:open-github-import'));
              }}
            >
              <Github className="size-3.5" />
              {t('fab.fromGithub')}
            </Button>
          </div>
        </div>

        {/* Table or Empty State */}
        <div className="min-h-0 flex-1">
          {filteredRows.length > 0 ? (
            <FeatureTreeTable
              data={filteredRows}
              repos={repos}
              onRowClick={handleRowClick}
              groupBy={groupBy}
              groupSortDir={groupSortDir}
              itemSortField={itemSortField}
              itemSortDir={itemSortDir}
              onTableRender={handleTableRender}
              onCreateFeatureForRepo={handleCreateFeatureForRepo}
            />
          ) : (
            <EmptyState
              icon={<Search className="size-10" />}
              title="Nothing to show"
              description={
                hasActiveFilters
                  ? 'No applications or features match your current filters. Try adjusting your search or filters.'
                  : 'No applications or features found in any repository.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>

        {/* Portal manager for row action dropdowns */}
        <FeatureRowActionsManager
          tableContainer={tableContainer}
          renderTick={renderTick}
          features={filteredFeatures}
          inFlightIds={inFlightIds}
          onStart={handleStart}
          onStop={handleStop}
          onRetry={handleRetry}
          onReview={handleReview}
          onArchive={handleArchiveRequest}
          onUnarchive={handleUnarchive}
          onDelete={handleDeleteRequest}
        />

        {/* Portal manager for application row action dropdowns */}
        <ApplicationRowActionsManager
          tableContainer={tableContainer}
          renderTick={renderTick}
          rows={filteredRows}
        />

        {/* Portal manager for repository group action buttons */}
        <RepositoryGroupActionsManager
          tableContainer={tableContainer}
          renderTick={renderTick}
          callbacks={repoActionCallbacks}
        />

        {/* Archive confirmation dialog */}
        <AlertDialog
          open={archiveTarget !== null}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        >
          <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('featureNode.archiveConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                <Trans
                  t={t}
                  i18nKey="featureNode.archiveConfirmDescription"
                  values={{ name: archiveTarget?.featureName }}
                  components={{ strong: <strong /> }}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setArchiveTarget(null)}>
                {t('featureNode.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleArchiveConfirm}>
                {t('featureNode.archive')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete confirmation dialog */}
        <DeleteFeatureDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onConfirm={handleDeleteConfirm}
          isDeleting={deleteTarget !== null && inFlightIds.has(deleteTarget.featureId)}
          featureName={deleteTarget?.featureName ?? ''}
          featureId={deleteTarget?.featureId ?? ''}
          hasChildren={deleteTarget?.hasChildren}
          hasOpenPr={deleteTarget?.hasOpenPr}
        />

        {/* (+) FAB — bottom-right, fixed position */}
        <InventoryFab actions={fabActions} />

        {/* Create feature drawer */}
        <FeatureCreateDrawer
          open={createDrawerOpen}
          onClose={() => {
            setCreateDrawerOpen(false);
            setCreateForRepoPath('');
          }}
          onSubmit={handleCreateFeatureSubmit}
          repositoryPath={createForRepoPath}
          features={createData.featureOptions}
          repositories={createData.repositoryOptions}
          workflowDefaults={createData.workflowDefaults}
          currentAgentType={createData.currentAgentType}
          currentModel={createData.currentModel}
          isSubmitting={isCreatingFeature}
        />

        {/* New project dialog */}
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          onCreated={handleNewProjectCreated}
        />

        {/* Full-screen create application overlay */}
        {showCreatePrompt ? (
          <div className="fixed inset-0 z-50">
            <ControlCenterEmptyState
              onRepositorySelect={(path) => {
                setShowCreatePrompt(false);
                addRepository({ path })
                  .then((result) => {
                    if (result.error) {
                      toast.error(result.error);
                    } else {
                      router.refresh();
                    }
                  })
                  .catch(() => {
                    toast.error('Failed to add repository');
                  });
              }}
              onApplicationCreated={(appId) => {
                setShowCreatePrompt(false);
                router.push(`/application/${appId}`);
              }}
              onClose={() => setShowCreatePrompt(false)}
              className="bg-background"
            />
          </div>
        ) : null}
      </div>
    </DeploymentStatusProvider>
  );
}

/** (+) FAB positioned fixed at the bottom-right of the viewport. */
function InventoryFab({ actions }: { actions: FloatingActionButtonAction[] }) {
  const { state } = useSidebar();
  const { i18n } = useTranslation('web');
  const { swapPosition } = useFabLayout();
  const isRtl = i18n.dir() === 'rtl';

  if (swapPosition) {
    const positionStyle: React.CSSProperties = isRtl
      ? {
          left: 'calc(var(--sidebar-width-icon) + 32px)',
          transition: 'left 200ms ease-in-out',
        }
      : { right: '32px', transition: 'right 200ms ease-in-out' };

    return (
      <FloatingActionButton actions={actions} className="!fixed bottom-6" style={positionStyle} />
    );
  }

  const offset =
    state === 'expanded'
      ? 'calc(var(--sidebar-width) + 32px)'
      : 'calc(var(--sidebar-width-icon) + 32px)';

  const positionStyle: React.CSSProperties = isRtl
    ? { right: offset, transition: 'right 200ms ease-in-out' }
    : { left: offset, transition: 'left 200ms ease-in-out' };

  return (
    <FloatingActionButton actions={actions} className="!fixed bottom-6" style={positionStyle} />
  );
}
