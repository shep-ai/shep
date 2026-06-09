/**
 * RiskTrendChart — minimal SVG line chart of open findings per bucket
 * (feature 098, phase 7, task-43 / FR-25).
 *
 * Presentation only. Reads `buckets` (each carrying per-severity counts)
 * and renders one line per canonical severity color-coded to match
 * SeverityBadge. Designed to avoid pulling in a charting dependency —
 * the chart shape is simple enough that hand-rolled SVG keeps the
 * bundle small and the file under 300 lines (NFR-19).
 */

'use client';

import { cn } from '@/lib/utils';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

export interface TrendChartBucket {
  /** ISO string for SSR friendliness — parents serialize Dates before passing. */
  bucketStart: string;
  countsBySeverity: { severity: CanonicalSeverity; count: number }[];
}

export interface RiskTrendChartProps {
  buckets?: TrendChartBucket[];
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** Override the displayed severities. Default: all five. */
  visibleSeverities?: CanonicalSeverity[];
}

const ALL_SEVERITIES: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
  CanonicalSeverity.Info,
];

const SEVERITY_STROKE: Record<CanonicalSeverity, string> = {
  [CanonicalSeverity.Critical]: '#dc2626',
  [CanonicalSeverity.High]: '#ea580c',
  [CanonicalSeverity.Medium]: '#d97706',
  [CanonicalSeverity.Low]: '#0284c7',
  [CanonicalSeverity.Info]: '#737373',
};

const PADDING = 24;
const HEIGHT = 200;
const WIDTH = 600;

export function RiskTrendChart({
  buckets,
  loading,
  error,
  className,
  visibleSeverities = ALL_SEVERITIES,
}: RiskTrendChartProps) {
  if (loading) {
    return (
      <div
        data-testid="risk-trend-chart-loading"
        className={cn('flex h-48 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading trend…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="risk-trend-chart-error"
        role="alert"
        className={cn(
          'flex h-48 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (!buckets || buckets.length === 0) {
    return (
      <div
        data-testid="risk-trend-chart-empty"
        className={cn(
          'flex h-48 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No trend yet</span>
        <span className="text-muted-foreground text-xs">
          Trend builds as scanners ingest findings over time
        </span>
      </div>
    );
  }

  const maxValue = Math.max(1, ...buckets.flatMap((b) => b.countsBySeverity.map((c) => c.count)));
  const stepX = buckets.length > 1 ? (WIDTH - 2 * PADDING) / (buckets.length - 1) : 0;

  const projectY = (count: number): number =>
    PADDING + (HEIGHT - 2 * PADDING) * (1 - count / maxValue);

  return (
    <figure
      data-testid="risk-trend-chart"
      className={cn('bg-card flex flex-col gap-2 rounded-md border p-3', className)}
      role="figure"
      aria-label={`Risk trend over ${buckets.length} buckets`}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-48 w-full"
        role="img"
        aria-label="Open findings per canonical severity over time"
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
        {visibleSeverities.map((sev) => {
          const points = buckets.map((b, i) => {
            const count = b.countsBySeverity.find((c) => c.severity === sev)?.count ?? 0;
            const x = PADDING + i * stepX;
            const y = projectY(count);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });
          return (
            <polyline
              key={sev}
              data-testid={`risk-trend-line-${sev.toLowerCase()}`}
              fill="none"
              stroke={SEVERITY_STROKE[sev]}
              strokeWidth={2}
              points={points.join(' ')}
            />
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-3 text-[11px]">
        {visibleSeverities.map((sev) => (
          <span key={sev} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-3 rounded-sm"
              style={{ backgroundColor: SEVERITY_STROKE[sev] }}
            />
            <span className="font-medium">{sev}</span>
          </span>
        ))}
        <span className="text-muted-foreground ml-auto">
          {formatRange(buckets[0].bucketStart, buckets[buckets.length - 1].bucketStart)}
        </span>
      </figcaption>
    </figure>
  );
}

function formatRange(start: string, end: string): string {
  return `${start.slice(0, 10)} → ${end.slice(0, 10)}`;
}
