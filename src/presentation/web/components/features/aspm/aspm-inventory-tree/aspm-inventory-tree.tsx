/**
 * AspmInventoryTree — reuses FeatureTreeTable for the /aspm/inventory
 * page so the layout, group-by-repo affordance, and frozen actions
 * column match /features exactly. The page-specific bits live here:
 *
 *  - extra Security + Last-scan columns (HTML formatters)
 *  - row click → /aspm/findings?app=<id>
 *  - per-row Scan-now / Re-scan trigger portaled into the actions cell
 *
 * Pure presentation — the server component owns data fetching and hands
 * the augmented FeatureTreeRow[] in via props.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { FeatureTreeTable, type FeatureTreeRow } from '@/components/features/feature-tree-table';

import { buildAspmExtraColumns } from './aspm-inventory-columns';
import { AspmRowActionsManager } from './aspm-row-actions-manager';

export interface AspmInventoryTreeProps {
  rows: FeatureTreeRow[];
  className?: string;
  error?: string | null;
  /** Optional override for the row-click navigation — useful in stories / tests. */
  onApplicationOpen?: (applicationId: string) => void;
}

export function AspmInventoryTree({
  rows,
  className,
  error,
  onApplicationOpen,
}: AspmInventoryTreeProps) {
  const router = useRouter();
  const [tableContainer, setTableContainer] = useState<HTMLDivElement | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  const handleRowClick = useCallback(
    (row: FeatureTreeRow) => {
      if (!row._isApplication || !row._applicationId) return;
      if (onApplicationOpen) {
        onApplicationOpen(row._applicationId);
        return;
      }
      router.push(
        `/aspm/findings?app=${encodeURIComponent(row._applicationId)}` as unknown as Parameters<
          typeof router.push
        >[0]
      );
    },
    [router, onApplicationOpen]
  );

  const handleTableRender = useCallback((container: HTMLDivElement) => {
    setTableContainer(container);
    setRenderTick((t) => t + 1);
  }, []);

  const extraColumns = useMemo(() => buildAspmExtraColumns(), []);

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="aspm-inventory-tree-error"
        role="alert"
        className={cn(
          'flex h-64 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid="aspm-inventory-tree-empty"
        className={cn(
          'flex h-64 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No applications inventoried yet</span>
        <span className="text-muted-foreground text-xs">
          Create an Application to see it on the inventory table.
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="aspm-inventory-tree"
      className={cn('flex h-full min-h-[480px] flex-col rounded-md border', className)}
    >
      <FeatureTreeTable
        data={rows}
        onRowClick={handleRowClick}
        groupBy="repositoryName"
        onTableRender={handleTableRender}
        extraColumns={extraColumns}
      />
      <AspmRowActionsManager tableContainer={tableContainer} renderTick={renderTick} rows={rows} />
    </div>
  );
}
