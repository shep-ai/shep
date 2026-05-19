/**
 * AssetNode — React Flow custom node for the ASPM asset-risk inventory
 * graph (feature 098, phase 7, task-47). Renders a small badge per
 * asset (fleet / application / owner) with the open-finding count and
 * risk-score sum.
 */

'use client';

import { Handle, Position } from '@xyflow/react';

import { cn } from '@/lib/utils';

export interface AssetNodeData {
  label: string;
  kind: 'fleet' | 'application' | 'service' | 'api' | 'cloud' | 'owner';
  openFindingCount: number;
  riskScoreSum: number;
  ownerId?: string;
  /** React Flow data nodes must permit unknown props at runtime. */
  [key: string]: unknown;
}

export interface AtRiskApplication {
  applicationId: string;
  openFindingCount: number;
  riskScoreSum: number;
}

const KIND_STYLES: Record<AssetNodeData['kind'], string> = {
  fleet:
    'bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-100',
  application:
    'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950 dark:border-sky-900 dark:text-sky-100',
  service:
    'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-100',
  api: 'bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950 dark:border-violet-900 dark:text-violet-100',
  cloud:
    'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-100',
  owner:
    'bg-neutral-50 border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100',
};

export function AssetNode({ data }: { data: AssetNodeData; [key: string]: unknown }) {
  return (
    <div
      data-testid={`asset-node-${data.kind}-${data.label}`}
      className={cn(
        'flex w-44 flex-col gap-1 rounded-md border px-3 py-2 text-xs shadow-sm',
        KIND_STYLES[data.kind]
      )}
      role="group"
      aria-label={`${data.kind} ${data.label}: ${data.openFindingCount} open findings, risk score ${data.riskScoreSum}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-current" />
      <span className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
        {data.kind}
      </span>
      <span className="truncate text-sm font-semibold">{data.label}</span>
      <div className="flex items-center justify-between text-[11px] tabular-nums">
        <span>{data.openFindingCount} open</span>
        <span>risk {data.riskScoreSum}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-current" />
    </div>
  );
}
