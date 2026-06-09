'use client';

import { CheckCircle2, AlertTriangle, Clock, Loader2, MinusCircle } from 'lucide-react';
import type { ScanRun, ScanStage, ScanStageStatus } from '@shepai/core/domain/generated/output';

export interface ScanProgressPanelProps {
  run: ScanRun | null;
  /** Header label override. Defaults to "Last scan". */
  title?: string;
}

function StatusIcon({ status }: { status: ScanStageStatus | string }) {
  switch (status) {
    case 'Succeeded':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'Failed':
      return <AlertTriangle className="text-destructive h-4 w-4" />;
    case 'Running':
      return <Loader2 className="text-primary h-4 w-4 animate-spin" />;
    case 'Skipped':
      return <MinusCircle className="text-muted-foreground h-4 w-4" />;
    default:
      return <Clock className="text-muted-foreground h-4 w-4" />;
  }
}

function formatDuration(stage: ScanStage): string {
  if (!stage.startedAt || !stage.finishedAt) return '';
  const start =
    stage.startedAt instanceof Date
      ? stage.startedAt.getTime()
      : Date.parse(String(stage.startedAt));
  const end =
    stage.finishedAt instanceof Date
      ? stage.finishedAt.getTime()
      : Date.parse(String(stage.finishedAt));
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ScanProgressPanel({ run, title = 'Last scan' }: ScanProgressPanelProps) {
  if (!run) {
    return (
      <div
        className="border-border/60 bg-card text-muted-foreground rounded border p-4 text-sm"
        data-testid="scan-progress-empty"
      >
        No scan has run yet. Click <span className="font-medium">Scan now</span> to start one.
      </div>
    );
  }

  return (
    <div
      className="border-border/60 bg-card rounded border p-4 text-sm"
      data-testid="scan-progress-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <span
          className="bg-muted rounded px-2 py-0.5 text-xs font-medium"
          data-testid="scan-progress-status"
        >
          {run.status}
        </span>
      </div>
      <ul className="space-y-1.5">
        {run.stages.map((stage) => (
          <li
            key={stage.name}
            className="flex items-center justify-between gap-2"
            data-testid={`scan-progress-stage-${stage.name}`}
          >
            <span className="flex items-center gap-2">
              <StatusIcon status={stage.status} />
              <span className="font-medium capitalize">{stage.name}</span>
              {stage.findingsCount !== undefined ? (
                <span className="text-muted-foreground text-xs">
                  {stage.findingsCount} finding{stage.findingsCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {stage.componentsCount !== undefined ? (
                <span className="text-muted-foreground text-xs">
                  {stage.componentsCount} components
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatDuration(stage)}
              {stage.errorMessage ? ` · ${stage.errorMessage}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
