/**
 * AssetRiskGraph — React Flow rendering of the ASPM asset-risk
 * inventory (feature 098, phase 7, task-47). Tabular fallback applies
 * when `feature-flag: tabular` is requested or the input is empty (NFR
 * fallback per plan risk row).
 */

'use client';

import { useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Background, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import { AssetNode, type AssetNodeData, type AtRiskApplication } from './asset-node';
import { buildAssetGraphNodes, type BuildAssetGraphInput } from './build-asset-graph-nodes';

export interface AssetRiskGraphProps {
  applications: BuildAssetGraphInput['applications'];
  atRisk: AtRiskApplication[];
  ownerNames?: Map<string, string>;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** Force the tabular fallback (used by the feature-flag escape hatch). */
  forceTabular?: boolean;
}

const nodeTypes = { asset: AssetNode };

export function AssetRiskGraph(props: AssetRiskGraphProps) {
  const { loading, error, applications, atRisk, ownerNames, className, forceTabular } = props;

  if (loading) {
    return (
      <div
        data-testid="asset-risk-graph-loading"
        className={cn('flex h-96 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading inventory…</span>
      </div>
    );
  }
  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="asset-risk-graph-error"
        role="alert"
        className={cn(
          'flex h-96 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }
  if (applications.length === 0) {
    return (
      <div
        data-testid="asset-risk-graph-empty"
        className={cn(
          'flex h-96 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No applications inventoried yet</span>
        <span className="text-muted-foreground text-xs">
          Create an Application to see it on the inventory graph.
        </span>
      </div>
    );
  }

  if (forceTabular) {
    return <AssetRiskTabular applications={applications} atRisk={atRisk} className={className} />;
  }

  return (
    <ReactFlowProvider>
      <AssetRiskGraphInner
        applications={applications}
        atRisk={atRisk}
        ownerNames={ownerNames}
        className={className}
      />
    </ReactFlowProvider>
  );
}

type InnerProps = Pick<AssetRiskGraphProps, 'applications' | 'atRisk' | 'ownerNames' | 'className'>;

function AssetRiskGraphInner({ applications, atRisk, ownerNames, className }: InnerProps) {
  const { nodes, edges } = useMemo(
    () => buildAssetGraphNodes({ applications, atRisk, ownerNames }),
    [applications, atRisk, ownerNames]
  );

  return (
    <div
      data-testid="asset-risk-graph"
      role="region"
      aria-label="ASPM asset risk graph"
      className={cn('bg-card h-[480px] rounded-md border', className)}
      style={{ padding: 24 }}
    >
      <ReactFlow
        nodes={nodes as Node<AssetNodeData>[]}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
      >
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

function AssetRiskTabular({
  applications,
  atRisk,
  className,
}: {
  applications: BuildAssetGraphInput['applications'];
  atRisk: AtRiskApplication[];
  className?: string;
}) {
  const atRiskById = new Map(atRisk.map((r) => [r.applicationId, r]));
  return (
    <div
      data-testid="asset-risk-graph-tabular"
      className={cn('overflow-x-auto rounded-md border', className)}
      role="region"
      aria-label="ASPM asset risk table"
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-[11px] tracking-wide uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Application
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Open
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Risk score sum
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Owner
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const r = atRiskById.get(app.id);
            return (
              <tr key={app.id} className="border-t">
                <td className="px-3 py-2 font-medium">{app.name}</td>
                <td className="px-3 py-2 tabular-nums">{r?.openFindingCount ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{r?.riskScoreSum ?? 0}</td>
                <td className="text-muted-foreground px-3 py-2">{app.ownerId ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
