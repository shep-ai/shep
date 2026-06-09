/**
 * /aspm — ASPM Dashboard
 *
 * Feature 098, phase 7 (task-43). Server component that fetches the
 * posture summary and the 30-day risk trend via use cases resolved from
 * the DI container, then renders the dashboard with thin client
 * components (PostureCards + RiskTrendChart). Live updates layer on top
 * via the SSE route at /api/aspm/posture/stream — wired by the client
 * subscriber in PostureCardsLive.
 */

import type {
  GetPostureSummaryUseCase,
  PostureSummary,
} from '@shepai/core/application/use-cases/aspm/posture/get-posture-summary';
import type {
  GetRiskTrendUseCase,
  GetRiskTrendResult,
} from '@shepai/core/application/use-cases/aspm/posture/get-risk-trend';
import { resolve } from '@/lib/server-container';
import { PostureCardsLive } from '@/components/features/aspm/posture-cards-live';
import { RiskTrendChart, type TrendChartBucket } from '@/components/features/aspm/risk-trend-chart';
import type { PostureSummaryView } from '@/components/features/aspm/posture-cards';

export const dynamic = 'force-dynamic';

export default async function AspmDashboardPage() {
  let summary: PostureSummary | null = null;
  let trend: GetRiskTrendResult | null = null;
  let summaryError: string | null = null;
  let trendError: string | null = null;

  try {
    summary = await resolve<GetPostureSummaryUseCase>('GetPostureSummaryUseCase').execute();
  } catch (err) {
    summaryError = err instanceof Error ? err.message : String(err);
  }
  try {
    trend = await resolve<GetRiskTrendUseCase>('GetRiskTrendUseCase').execute();
  } catch (err) {
    trendError = err instanceof Error ? err.message : String(err);
  }

  const initialView: PostureSummaryView | null = summary ? toView(summary) : null;
  const trendBuckets: TrendChartBucket[] = trend
    ? trend.buckets.map((b) => ({
        bucketStart: b.bucketStart.toISOString(),
        countsBySeverity: b.countsBySeverity,
      }))
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">ASPM</h1>
        <p className="text-muted-foreground text-sm">
          Application Security Posture Management — unified findings, ownership, and remediation
          across every Shep application.
        </p>
      </header>

      <section aria-labelledby="aspm-posture-heading" className="flex flex-col gap-2">
        <h2 id="aspm-posture-heading" className="text-sm font-semibold tracking-wide uppercase">
          Posture
        </h2>
        <PostureCardsLive initialSummary={initialView} initialError={summaryError} />
      </section>

      <section aria-labelledby="aspm-trend-heading" className="flex flex-col gap-2">
        <h2 id="aspm-trend-heading" className="text-sm font-semibold tracking-wide uppercase">
          30-day risk trend
        </h2>
        <RiskTrendChart buckets={trendBuckets} error={trendError} />
      </section>
    </div>
  );
}

function toView(summary: PostureSummary): PostureSummaryView {
  return {
    openBySeverity: summary.openBySeverity,
    topAtRiskApplications: summary.topAtRiskApplications,
    kevOpenCount: summary.kevOpenCount,
    slaBreachCount: summary.slaBreachCount,
    exceptionCount: summary.exceptionCount,
    aiReviewQueueDepth: summary.aiReviewQueueDepth,
    lastIngestedAt: summary.lastIngestedAt ? summary.lastIngestedAt.toISOString() : null,
  };
}
