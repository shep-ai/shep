'use client';

import { useEffect, useRef, useCallback } from 'react';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import type { ColumnDefinition, CellComponent, RowComponent } from 'tabulator-tables';
import { cn } from '@/lib/utils';
import type { FeatureStatus } from '@/components/common/feature-status-config';
import type { FeatureNodeState } from '@/components/common/feature-node/feature-node-state-config';
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
  /** Repository path for the repo this row belongs to (used to create features from repo groups) */
  _repositoryPath?: string;
  /** Repository ID (used for sync and deploy actions on repo group headers) */
  _repositoryId?: string;
  /** Derived UI node state for action mapping (9-state model from derive-feature-state) */
  nodeState?: FeatureNodeState;
  /** Whether this feature has child features (for delete dialog cascade option) */
  hasChildren?: boolean;
  /** Whether this feature has an open pull request (for delete dialog close-PR option) */
  hasOpenPr?: boolean;
  /** Whether this row represents an application instead of a feature */
  _isApplication?: boolean;
  /** Real application id (without the `app-` prefix used for table row id) */
  _applicationId?: string;
  /** Optional cloud preview URL for application rows */
  _applicationCloudUrl?: string;
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
  /** Called when a clickable row (feature or application) is clicked. */
  onRowClick?: (row: FeatureTreeRow) => void;
  /** When set, features are grouped into a tree by this field. */
  groupBy?: GroupByField | null;
  /** Sort direction for group headers. */
  groupSortDir?: SortDir;
  /** Field to sort items within each group (or globally in flat mode). */
  itemSortField?: string;
  /** Sort direction for items. */
  itemSortDir?: SortDir;
  /** Called when the table renders/re-renders with a ref to the container, for portal management. */
  onTableRender?: (container: HTMLDivElement) => void;
  /** Called when the (+) button on a repo group header is clicked, with the repository path. */
  onCreateFeatureForRepo?: (repositoryPath: string) => void;
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

/** SVG app icon — lucide LayoutGrid (14px) */
const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;

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

/** Name formatter for non-grouped (flat) rows. Adds an "App" badge when the row is an application. */
function flatNameFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  const name = escapeHtml(cell.getValue() as string);
  if (!row._isApplication) return name;
  return `<span style="display:inline-flex;align-items:center;gap:8px"><span style="display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:9999px;background-color:color-mix(in srgb,currentColor 8%,transparent);color:var(--color-muted-foreground,#64748b);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">${APP_ICON_SVG}<span>App</span></span><span>${name}</span></span>`;
}

function repoFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader) return '';
  const val = cell.getValue() as string;
  return `<span style="display:inline-flex;align-items:center;gap:6px">${REPO_ICON_SVG}<span>${escapeHtml(val)}</span></span>`;
}

/** SVG plus icon — lucide Plus (14px) */
const PLUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

function groupHeaderNameFormatter(
  groupBy: GroupByField
): (cell: CellComponent) => string | HTMLElement {
  return (cell: CellComponent) => {
    const row = cell.getRow().getData() as FeatureTreeRow;
    if (!row._isGroupHeader) return flatNameFormatter(cell);

    const icon = groupBy === 'repositoryName' ? REPO_ICON_SVG : GROUP_ICON_SVG;
    const count = row._groupCount ?? 0;
    const countLabel = count === 1 ? '1 item' : `${count} items`;

    const container = document.createElement('span');
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';
    container.style.fontWeight = '600';
    container.style.width = '100%';

    container.innerHTML = `${icon}<span>${escapeHtml(row.name)}</span><span style="font-weight:400;color:var(--color-muted-foreground,#64748b);font-size:12px">${countLabel}</span>`;

    // Add repo action buttons and (+) button for repository group headers
    if (groupBy === 'repositoryName' && row._repositoryPath) {
      // Spacer to push actions to the right
      const actionArea = document.createElement('span');
      actionArea.style.marginLeft = 'auto';
      actionArea.style.display = 'inline-flex';
      actionArea.style.alignItems = 'center';
      actionArea.style.gap = '2px';
      actionArea.style.flexShrink = '0';

      // Portal target for React-rendered repo action buttons
      const repoActionsPortal = document.createElement('span');
      repoActionsPortal.setAttribute('data-repo-actions', row._repositoryPath);
      if (row._repositoryId) {
        repoActionsPortal.setAttribute('data-repo-id', row._repositoryId);
      }
      repoActionsPortal.style.display = 'inline-flex';
      repoActionsPortal.style.alignItems = 'center';
      repoActionsPortal.style.gap = '2px';
      actionArea.appendChild(repoActionsPortal);

      // (+) create feature button
      const btn = document.createElement('button');
      btn.className = 'inventory-create-for-repo-btn';
      btn.setAttribute('data-create-for-repo', row._repositoryPath);
      btn.setAttribute('title', 'New feature');
      btn.innerHTML = PLUS_ICON_SVG;
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.width = '24px';
      btn.style.height = '24px';
      btn.style.borderRadius = '4px';
      btn.style.border = 'none';
      btn.style.background = 'transparent';
      btn.style.cursor = 'pointer';
      btn.style.color = 'var(--color-muted-foreground, #64748b)';
      btn.style.flexShrink = '0';
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--color-accent, #f1f5f9)';
        btn.style.color = 'var(--color-foreground, #0f172a)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--color-muted-foreground, #64748b)';
      });
      actionArea.appendChild(btn);

      container.appendChild(actionArea);
    }

    return container;
  };
}

// ── Actions column ────────────────────────────────────────────

export const ACTIONS_COLUMN_FIELD = '_actions';
const ACTIONS_COLUMN_WIDTH = 48;

/**
 * Tabulator custom formatter for the actions column.
 * Creates a portal target div with data-feature-id for regular rows.
 * Returns empty string for group header rows (no actions on headers).
 */
export function actionsColumnFormatter(cell: CellComponent): string | HTMLElement {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader || row._isRepoGroup) return '';

  const container = document.createElement('div');
  if (row._isApplication && row._applicationId) {
    container.setAttribute('data-application-id', row._applicationId);
  } else {
    container.setAttribute('data-feature-id', row.id);
  }
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.width = '100%';
  container.style.height = '100%';
  return container;
}

// ── Column builders ──────────────────────────────────────────

interface ColumnConfig {
  onRowClick?: (row: FeatureTreeRow) => void;
  groupBy?: GroupByField | null;
}

/** All possible columns. We'll filter out the grouped-by column in tree mode. */
export function buildColumns({ onRowClick, groupBy }: ColumnConfig): ColumnDefinition[] {
  const clickProps = onRowClick
    ? {
        cellClick: (_e: UIEvent, cell: CellComponent) => {
          const data = cell.getRow().getData() as FeatureTreeRow;
          if (data._isGroupHeader) return;
          onRowClick(data);
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
      formatter: isGrouped ? groupHeaderNameFormatter(groupBy!) : flatNameFormatter,
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
    {
      title: '',
      field: ACTIONS_COLUMN_FIELD,
      width: ACTIONS_COLUMN_WIDTH,
      headerSort: false,
      resizable: false,
      frozen: true,
      formatter: actionsColumnFormatter,
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
      // Carry repo info from the first child for create-from-repo and repo actions
      ...(groupBy === 'repositoryName' && features[0]?._repositoryPath
        ? {
            _repositoryPath: features[0]._repositoryPath,
            _repositoryId: features[0]._repositoryId,
          }
        : {}),
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
  onRowClick,
  groupBy = null,
  groupSortDir = 'asc',
  itemSortField = 'name',
  itemSortDir = 'asc',
  onTableRender,
  onCreateFeatureForRepo,
}: FeatureTreeTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabulatorRef = useRef<Tabulator | null>(null);
  const onRowClickRef = useRef(onRowClick);
  onRowClickRef.current = onRowClick;
  const onTableRenderRef = useRef(onTableRender);
  onTableRenderRef.current = onTableRender;
  const onCreateFeatureForRepoRef = useRef(onCreateFeatureForRepo);
  onCreateFeatureForRepoRef.current = onCreateFeatureForRepo;

  const stableOnRowClick = useCallback((row: FeatureTreeRow) => {
    onRowClickRef.current?.(row);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const isGrouped = !!groupBy;
    const columns = buildColumns({ onRowClick: stableOnRowClick, groupBy });

    const tableData = isGrouped
      ? buildGroupedTree(data, groupBy!, groupSortDir, itemSortField, itemSortDir)
      : data;

    const container = containerRef.current;

    const table = new Tabulator(container, {
      data: tableData,
      columns,
      layout: 'fitColumns',
      height: '100%',
      placeholder: 'No features found',
      ...(isGrouped
        ? {
            dataTree: true,
            dataTreeStartExpanded: false,
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

    table.on('renderComplete', () => {
      onTableRenderRef.current?.(container);
    });

    table.on('tableBuilt', () => {
      onTableRenderRef.current?.(container);
    });

    // Event delegation for (+) create-for-repo buttons in group headers
    const handleCreateClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-create-for-repo]') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();
      const repoPath = btn.getAttribute('data-create-for-repo');
      if (repoPath) {
        onCreateFeatureForRepoRef.current?.(repoPath);
      }
    };
    container.addEventListener('click', handleCreateClick);

    tabulatorRef.current = table;

    return () => {
      container.removeEventListener('click', handleCreateClick);
      table.destroy();
      tabulatorRef.current = null;
    };
  }, [data, stableOnRowClick, groupBy, groupSortDir, itemSortField, itemSortDir]);

  return (
    <div
      data-testid="feature-tree-table"
      className={cn('h-full w-full', className)}
      ref={containerRef}
    />
  );
}
