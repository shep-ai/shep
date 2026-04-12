'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useMemo } from 'react';
import { Search, SlidersHorizontal, Archive, Inbox, X, ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { FeatureTreeTable } from '@/components/features/feature-tree-table';
import type {
  FeatureTreeRow,
  InventoryRepo,
  GroupByField,
  SortDir,
} from '@/components/features/feature-tree-table';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FeatureStatus } from '@/components/common/feature-status-config';

export interface FeatureTreePageClientProps {
  features: FeatureTreeRow[];
  repos: InventoryRepo[];
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

export function FeatureTreePageClient({ features, repos }: FeatureTreePageClientProps) {
  const router = useRouter();

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

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      router.push(`/feature/${featureId}/overview`);
    },
    [router]
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

  return (
    <div data-testid="feature-tree-page" className="flex h-full flex-col gap-4">
      <PageHeader title="Inventory" description="All repositories and features" />

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
                archiveFilter === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
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

      {/* Results count */}
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>
          {filteredFeatures.length} feature{filteredFeatures.length !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters ? (
          <Badge variant="secondary" className="text-xs">
            filtered
          </Badge>
        ) : null}
      </div>

      {/* Table or Empty State */}
      <div className="min-h-0 flex-1">
        {filteredFeatures.length > 0 ? (
          <FeatureTreeTable
            data={filteredFeatures}
            repos={repos}
            onFeatureClick={handleFeatureClick}
            groupBy={groupBy}
            groupSortDir={groupSortDir}
            itemSortField={itemSortField}
            itemSortDir={itemSortDir}
          />
        ) : (
          <EmptyState
            icon={<Search className="size-10" />}
            title="No matching features"
            description={
              hasActiveFilters
                ? 'No features match your current filters. Try adjusting your search or filters.'
                : 'No features found in any repository.'
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
    </div>
  );
}
