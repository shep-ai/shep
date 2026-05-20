'use client';

/**
 * DoctorSummary — spec 097, task-46.
 *
 * Renders an inline DoctorReport summary on the contributor view: counts
 * of ok/warn/fail and per-diagnostic detail. Pure presentation; data
 * comes via props.
 */

import { CheckCircle2, AlertTriangle, XCircle, Stethoscope } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DiagnosticStatus } from '@shepai/core/domain/generated/output';

export interface DoctorSummaryResult {
  name: string;
  status: DiagnosticStatus;
  detail: string;
  fixHint?: string;
}

export interface DoctorSummaryReport {
  results: readonly DoctorSummaryResult[];
  overallStatus: DiagnosticStatus;
  summary: { ok: number; warn: number; fail: number };
}

export interface DoctorSummaryProps {
  report?: DoctorSummaryReport;
  loading?: boolean;
}

export function DoctorSummary({ report, loading }: DoctorSummaryProps) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="doctor-summary"
      aria-label="Environment diagnostic summary"
    >
      <header className="flex items-center gap-2">
        <Stethoscope className="text-primary size-5" aria-hidden />
        <h2 className="text-lg font-semibold">Environment health</h2>
      </header>

      {loading || !report ? (
        <LoadingState />
      ) : (
        <>
          <Counts summary={report.summary} />
          <ul
            className="flex flex-col divide-y rounded-lg border"
            data-testid="doctor-summary-list"
          >
            {report.results.map((r) => (
              <DiagnosticRow key={r.name} result={r} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Counts({ summary }: { summary: DoctorSummaryReport['summary'] }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm" data-testid="doctor-summary-counts">
      <span className="inline-flex items-center gap-1.5" data-testid="doctor-summary-ok">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        <span className="font-medium">{summary.ok}</span>
        <span className="text-muted-foreground">ok</span>
      </span>
      <span className="inline-flex items-center gap-1.5" data-testid="doctor-summary-warn">
        <AlertTriangle className="size-4 text-amber-600" aria-hidden />
        <span className="font-medium">{summary.warn}</span>
        <span className="text-muted-foreground">warn</span>
      </span>
      <span className="inline-flex items-center gap-1.5" data-testid="doctor-summary-fail">
        <XCircle className="size-4 text-red-600" aria-hidden />
        <span className="font-medium">{summary.fail}</span>
        <span className="text-muted-foreground">fail</span>
      </span>
    </div>
  );
}

function DiagnosticRow({ result }: { result: DoctorSummaryResult }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2" data-testid={`doctor-row-${result.name}`}>
      <StatusIcon status={result.status} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium" data-testid={`doctor-row-name-${result.name}`}>
          {result.name}
        </p>
        <p className="text-muted-foreground text-xs">{result.detail}</p>
        {result.fixHint ? (
          <p
            className="text-muted-foreground/80 text-xs italic"
            data-testid={`doctor-row-fix-${result.name}`}
          >
            Hint: {result.fixHint}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: DiagnosticStatus }) {
  if (status === DiagnosticStatus.Ok) {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (status === DiagnosticStatus.Warn) {
    return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />;
  }
  return <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />;
}

function LoadingState() {
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="doctor-summary-loading">
      {(['l1', 'l2', 'l3'] as const).map((k) => (
        <li key={k} className="flex items-start gap-3 px-3 py-2">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
