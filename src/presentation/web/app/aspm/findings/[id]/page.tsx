/**
 * /aspm/findings/[id] — single-finding detail
 *
 * Feature 098, phase 7 (task-44). Server component that resolves the
 * finding + its current risk-score breakdown, then hands them to the
 * FindingDetailPanel + FindingActions client island for the declare /
 * revoke exception + convert-to-work-item actions.
 */

import type { GetFindingUseCase } from '@shepai/core/application/use-cases/aspm/findings/get-finding';
import type { RiskScore } from '@shepai/core/domain/generated/output';
import { FindingNotFoundError } from '@shepai/core/domain/aspm/errors/finding-not-found.error';
import { notFound } from 'next/navigation';
import type { IRiskScoreRepository } from '@shepai/core/application/ports/output/repositories/risk-score-repository.interface';

import { FindingDetailPanel } from '@/components/features/aspm/finding-detail-panel';
import { FindingActions } from '@/components/features/aspm/finding-actions';
import { resolve } from '@/lib/server-container';

export const dynamic = 'force-dynamic';

interface RouteProps {
  params: Promise<{ id: string }>;
}

export default async function FindingDetailRoute({ params }: RouteProps) {
  const { id } = await params;
  let finding;
  try {
    finding = await resolve<GetFindingUseCase>('GetFindingUseCase').execute({ id });
  } catch (err) {
    if (err instanceof FindingNotFoundError) {
      notFound();
    }
    throw err;
  }

  let breakdown: RiskScore['breakdown'] | null = null;
  try {
    const scoreRepo = resolve<IRiskScoreRepository>('IRiskScoreRepository');
    const score = await scoreRepo.findCurrentForFinding(finding.id);
    breakdown = score ? score.breakdown : null;
  } catch {
    breakdown = null;
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
      <h1 className="sr-only">Finding {finding.title ?? finding.ruleId}</h1>
      <FindingDetailPanel finding={finding} riskScoreBreakdown={breakdown} />
      <FindingActions findingId={finding.id} workItemId={finding.workItemId ?? null} />
    </div>
  );
}
