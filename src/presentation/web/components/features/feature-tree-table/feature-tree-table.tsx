'use client';

import { useEffect, useRef, useCallback } from 'react';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import type { ColumnDefinition, CellComponent, RowComponent } from 'tabulator-tables';
import { cn } from '@/lib/utils';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import './feature-tree-table.css';

export interface FeatureTreeRow {
  id: string;
  name: string;
  status: FeatureStatus;
  lifecycle: string;
  branch: string;
  repositoryName: string;
  remoteUrl?: string;
  parentId?: string;
  /** Internal: child rows for tree hierarchy */
  _children?: FeatureTreeRow[];
  /** Internal: whether this row is a group header */
  _isGroupHeader?: boolean;
  /** Internal: number of features in this group */
  _groupCount?: number;
  /** Internal: whether this row is a repository group header (legacy tree) */
  _isRepoGroup?: boolean;
  /** Internal: number of features in this repo group (legacy tree) */
  _featureCount?: number;
}

export interface InventoryRepo {
  name: string;
  remoteUrl?: string;
}

export type GroupByField = 'repositoryName' | 'status' | 'lifecycle';
export type SortDir = 'asc' | 'desc';

export interface FeatureTreeTableProps {
  data: FeatureTreeRow[];
  repos?: InventoryRepo[];
  className?: string;
  onFeatureClick?: (featureId: string) => void;
  /** When set, features are grouped into a tree by this field. */
  groupBy?: GroupByField | null;
  /** Sort direction for group headers. */
  groupSortDir?: SortDir;
  /** Field to sort items within each group (or globally in flat mode). */
  itemSortField?: string;
  /** Sort direction for items. */
  itemSortDir?: SortDir;
}

// ── Constants ────────────────────────────────────────────────

const STATUS_LABELS: Record<FeatureStatus, string> = {
  'action-needed': 'Action Needed',
  'in-progress': 'In Progress',
  pending: 'Pending',
  blocked: 'Blocked',
  error: 'Error',
  done: 'Done',
};

/** SVG repo icon — lucide FolderGit2 (16px) */
const REPO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><circle cx="12" cy="13" r="2"/><path d="M14 13h3"/><path d="M7 13h3"/></svg>`;

/** SVG group icon — lucide Layers (16px) */
const GROUP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22.54 12.43-1.42-.65-8.28 3.78a2 2 0 0 1-1.66 0l-8.28-3.78-1.42.65a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/></svg>`;

// ── Formatters ───────────────────────────────────────────────

function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader) return '';
  const value = cell.getValue() as FeatureStatus;
  const label = STATUS_LABELS[value] ?? value;
  return `<span class="status-pill status-pill--${value}"><span class="status-dot"></span>${label}</span>`;
}

function branchFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader) return '';
  const val = cell.getValue() as string;
  if (!val) return '';
  return `<code style="font-size:12px;color:var(--color-muted-foreground,#64748b);font-family:var(--font-mono)">${escapeHtml(val)}</code>`;
}

function lifecycleFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader) return '';
  return escapeHtml(cell.getValue() as string);
}

function repoFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader) return '';
  const val = cell.getValue() as string;
  return `<span style="display:inline-flex;align-items:center;gap:6px">${REPO_ICON_SVG}<span>${escapeHtml(val)}</span></span>`;
}

function groupHeaderNameFormatter(groupBy: GroupByField): (cell: CellComponent) => string {
  return (cell: CellComponent) => {
    const row = cell.getRow().getData() as FeatureTreeRow;
    if (!row._isGroupHeader) return escapeHtml(cell.getValue() as string);

    const icon = groupBy === 'repositoryName' ? REPO_ICON_SVG : GROUP_ICON_SVG;
    const count = row._groupCount ?? 0;
    const countLabel = count === 1 ? '1 feature' : `${count} features`;
    return `<span style="display:inline-flex;align-items:center;gap:8px;font-weight:600">${icon}<span>${escapeHtml(row.name)}</span><span style="font-weight:400;color:var(--color-muted-foreground,#64748b);font-size:12px">${countLabel}</span></span>`;
  };
}

// ── Column builders ──────────────────────────────────────────

interface ColumnConfig {
  onFeatureClick?: (featureId: string) => void;
  groupBy?: GroupByField | null;
}

/** All possible columns. We'll filter out the grouped-by column in tree mode. */
function buildColumns({ onFeatureClick, groupBy }: ColumnConfig): ColumnDefinition[] {
  const clickProps = onFeatureClick
    ? {
        cellClick: (_e: UIEvent, cell: CellComponent) => {
          const data = cell.getRow().getData() as FeatureTreeRow;
          if (data._isGroupHeader) return;
          onFeatureClick(data.id);
        },
        cssClass: 'cursor-pointer',
      }
    : {};

  const isGrouped = !!groupBy;

  const cols: (ColumnDefinition | null)[] = [
    {
      title: 'Name',
      field: 'name',
      widthGrow: 3,
      headerSort: !isGrouped,
      formatter: isGrouped
        ? groupHeaderNameFormatter(groupBy!)
        : (cell: CellComponent) => escapeHtml(cell.getValue() as string),
      ...clickProps,
    },
    groupBy !== 'repositoryName'
      ? {
          title: 'Repository',
          field: 'repositoryName',
          widthGrow: 2,
          headerSort: !isGrouped,
          formatter: repoFormatter,
        }
      : null,
    groupBy !== 'status'
      ? {
          title: 'Status',
          field: 'status',
          widthGrow: 1.5,
          headerSort: !isGrouped,
          formatter: statusFormatter,
        }
      : null,
    groupBy !== 'lifecycle'
      ? {
          title: 'Lifecycle',
          field: 'lifecycle',
          widthGrow: 1.5,
          headerSort: !isGrouped,
          formatter: lifecycleFormatter,
        }
      : null,
    {
      title: 'Branch',
      field: 'branch',
      widthGrow: 2,
      headerSort: !isGrouped,
      formatter: branchFormatter,
    },
  ];

  return cols.filter(Boolean) as ColumnDefinition[];
}

// ── Tree builder ─────────────────────────────────────────────

export function displayLabel(groupBy: GroupByField, value: string): string {
  if (groupBy === 'status') return STATUS_LABELS[value as FeatureStatus] ?? value;
  return value;
}

/**
 * Build tree-structured data grouped by repository (legacy format).
 * Each repository becomes a parent node with its features as children.
 * Repos without features are included as empty groups.
 */
export function buildTreeData(
  flatData: FeatureTreeRow[],
  repos?: InventoryRepo[]
): FeatureTreeRow[] {
  const byRepo = new Map<string, FeatureTreeRow[]>();
  for (const item of flatData) {
    const repoName = item.repositoryName || 'Unknown';
    if (!byRepo.has(repoName)) byRepo.set(repoName, []);
    byRepo.get(repoName)!.push(item);
  }

  const repoMeta = new Map<string, { remoteUrl?: string }>();
  if (repos) {
    for (const repo of repos) {
      repoMeta.set(repo.name, { remoteUrl: repo.remoteUrl });
      if (!byRepo.has(repo.name)) byRepo.set(repo.name, []);
    }
  }

  const roots: FeatureTreeRow[] = [];
  for (const [repoName, features] of byRepo) {
    const lookup = new Map<string, FeatureTreeRow>();
    const repoChildren: FeatureTreeRow[] = [];

    for (const item of features) lookup.set(item.id, { ...item, _children: [] });
    for (const item of features) {
      const node = lookup.get(item.id)!;
      if (item.parentId && lookup.has(item.parentId)) {
        lookup.get(item.parentId)!._children!.push(node);
      } else {
        repoChildren.push(node);
      }
    }
    for (const node of lookup.values()) {
      if (node._children?.length === 0) delete node._children;
    }

    const remoteUrl = repoMeta.get(repoName)?.remoteUrl ?? features[0]?.remoteUrl;
    roots.push({
      id: `repo-${repoName}`,
      name: repoName,
      status: 'pending' as FeatureStatus,
      lifecycle: '',
      branch: '',
      repositoryName: repoName,
      remoteUrl,
      _isRepoGroup: true,
      _featureCount: features.length,
      ...(repoChildren.length > 0 ? { _children: repoChildren } : {}),
    });
  }

  return roots;
}

export function buildGroupedTree(
  flatData: FeatureTreeRow[],
  groupBy: GroupByField,
  groupSortDir: SortDir,
  itemSortField: string,
  itemSortDir: SortDir
): FeatureTreeRow[] {
  // Group features by field value
  const groups = new Map<string, FeatureTreeRow[]>();
  for (const item of flatData) {
    const key = item[groupBy] || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // Sort items within each group
  const sortItems = (items: FeatureTreeRow[]) =>
    [...items].sort((a, b) => {
      const aVal = String(
        (a as unknown as Record<string, unknown>)[itemSortField] ?? ''
      ).toLowerCase();
      const bVal = String(
        (b as unknown as Record<string, unknown>)[itemSortField] ?? ''
      ).toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return itemSortDir === 'asc' ? cmp : -cmp;
    });

  // Build group header rows
  const roots: FeatureTreeRow[] = [];
  for (const [key, features] of groups) {
    const sortedChildren = sortItems(features);
    roots.push({
      id: `group-${groupBy}-${key}`,
      name: displayLabel(groupBy, key),
      status: 'pending' as FeatureStatus,
      lifecycle: '',
      branch: '',
      repositoryName: '',
      _isGroupHeader: true,
      _groupCount: features.length,
      _children: sortedChildren,
    });
  }

  // Sort groups
  roots.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return groupSortDir === 'asc' ? cmp : -cmp;
  });

  return roots;
}

// ── Component ────────────────────────────────────────────────

export function FeatureTreeTable({
  data,
  className,
  onFeatureClick,
  groupBy = null,
  groupSortDir = 'asc',
  itemSortField = 'name',
  itemSortDir = 'asc',
}: FeatureTreeTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabulatorRef = useRef<Tabulator | null>(null);
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;

  const stableOnFeatureClick = useCallback((featureId: string) => {
    onFeatureClickRef.current?.(featureId);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const isGrouped = !!groupBy;
    const columns = buildColumns({ onFeatureClick: stableOnFeatureClick, groupBy });

    const tableData = isGrouped
      ? buildGroupedTree(data, groupBy!, groupSortDir, itemSortField, itemSortDir)
      : data;

    const table = new Tabulator(containerRef.current, {
      data: tableData,
      columns,
      layout: 'fitColumns',
      height: '100%',
      placeholder: 'No features found',
      ...(isGrouped
        ? {
            dataTree: true,
            dataTreeStartExpanded: true,
            rowFormatter: (row: RowComponent) => {
              const rowData = row.getData() as FeatureTreeRow;
              if (rowData._isGroupHeader) {
                row.getElement().classList.add('tabulator-row-repo-group');
              }
            },
          }
        : {
            initialSort: [{ column: 'repositoryName', dir: 'asc' as const }],
          }),
    });

    tabulatorRef.current = table;

    return () => {
      table.destroy();
      tabulatorRef.current = null;
    };
  }, [data, stableOnFeatureClick, groupBy, groupSortDir, itemSortField, itemSortDir]);

  return (
    <div
      data-testid="feature-tree-table"
      className={cn('h-full w-full', className)}
      ref={containerRef}
    />
  );
}
