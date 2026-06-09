/**
 * API Route: POST /api/aspm/findings/[id]/risk-score
 *
 * On-demand risk-score computation for a single finding. Thin wrapper
 * around {@link ComputeRiskScoreForFindingUseCase} — all scoring logic,
 * persistence, and `currentRiskScoreId` update live in the use case.
 *
 * The findings detail panel surfaces this through the "Compute now"
 * button in the empty state of {@link RiskScoreBreakdown}; the page then
 * `router.refresh()`es to re-hydrate the breakdown SSR-side.
 */

import type {
  ComputeRiskScoreForFindingUseCase,
  ComputeRiskScoreForFindingResult,
} from '@shepai/core/application/use-cases/aspm/findings/compute-risk-score-for-finding';
import { FindingNotFoundError } from '@shepai/core/domain/aspm/errors/finding-not-found.error';

import { resolve } from '@/lib/server-container';
import { getFeatureFlags } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  if (!getFeatureFlags().aspm) {
    return new Response('Not Found', { status: 404 });
  }

  const { id } = await context.params;
  if (id.length === 0) {
    return Response.json({ error: 'finding id required' }, { status: 400 });
  }

  try {
    const useCase = resolve<ComputeRiskScoreForFindingUseCase>('ComputeRiskScoreForFindingUseCase');
    const result: ComputeRiskScoreForFindingResult = await useCase.execute({ findingId: id });
    return Response.json({
      riskScoreId: result.riskScore.id,
      total: result.riskScore.total,
      breakdown: result.riskScore.breakdown,
      computedAt: result.riskScore.computedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof FindingNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
