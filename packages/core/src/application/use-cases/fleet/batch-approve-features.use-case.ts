/**
 * Batch Approve Features Use Case
 *
 * Provides safe, error-isolated batch approval for features waiting on gates.
 * Approves candidates sequentially to avoid SQLite write lock contention and
 * worktree filesystem race conditions — one conflicted feature must never block
 * the rest of the batch.
 *
 * With `lowRisk`, every candidate is first judged against the configured
 * guardrails and only the provably safe ones are approved. Everything else is
 * reported as **skipped** with the reason, never silently dropped and never
 * approved: an empty guardrail configuration must not turn the flag into
 * `--all`.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependencies: IFleetRepository, ApproveAgentRunUseCase,
 *   EvaluateFeatureLowRiskUseCase
 */

import { injectable, inject } from 'tsyringe';
import { ApproveAgentRunUseCase } from '../agents/approve-agent-run.use-case.js';
import { EvaluateFeatureLowRiskUseCase } from './evaluate-feature-low-risk.use-case.js';
import type { IFleetRepository } from '../../ports/output/repositories/fleet-repository.interface.js';
import { isGuardrailGateType } from '../../../domain/shared/guardrail-rules.js';
import {
  FleetTriagePriority,
  FleetTriageCategory,
  GuardrailGateType,
  type FleetTriageItem,
} from '../../../domain/generated/output.js';

export interface BatchApproveFeaturesInput {
  /**
   * When supplied, only these feature IDs are considered. An **empty array
   * selects nothing** — it must never widen into "the whole fleet".
   */
  featureIds?: string[];
  /** When supplied (and not `all`), only this gate type is considered. */
  gateType?: GuardrailGateType;
  /**
   * Approve only candidates that the guardrails prove low-risk. No guardrail
   * rules means no approvals.
   */
  lowRisk?: boolean;
}

export interface BatchApproveResult {
  /** Number of gate candidates considered after filtering. */
  totalAttempted: number;
  approvedCount: number;
  approvedFeatureIds: string[];
  failedCount: number;
  failures: { featureId: string; reason: string }[];
  /** Candidates deliberately left for a human by the `--low-risk` filter. */
  skippedCount: number;
  skipped: { featureId: string; reason: string }[];
}

/** Gate triage items always carry the run ID that must be approved. */
type GateCandidate = FleetTriageItem & { runId: string };

function isGateCandidate(item: FleetTriageItem): item is GateCandidate {
  return item.category === FleetTriageCategory.gate && typeof item.runId === 'string';
}

@injectable()
export class BatchApproveFeaturesUseCase {
  constructor(
    @inject('IFleetRepository')
    private readonly fleetRepo: IFleetRepository,
    @inject(ApproveAgentRunUseCase)
    private readonly approveUseCase: ApproveAgentRunUseCase,
    @inject(EvaluateFeatureLowRiskUseCase)
    private readonly lowRisk: EvaluateFeatureLowRiskUseCase
  ) {}

  /**
   * Executes batch approval sequentially across matching waiting features.
   */
  async execute(input: BatchApproveFeaturesInput = {}): Promise<BatchApproveResult> {
    const triageItems = await this.fleetRepo.listTriageItems({
      priority: FleetTriagePriority.p1,
    });

    let candidates = triageItems.filter(isGateCandidate);

    // `!== undefined`, not `.length > 0`: a stale or emptied selection must
    // select nothing, never act on the whole fleet.
    if (input.featureIds !== undefined) {
      const allowed = new Set(input.featureIds);
      candidates = candidates.filter((item) => allowed.has(item.featureId));
    }

    if (input.gateType && input.gateType !== GuardrailGateType.all) {
      candidates = candidates.filter((item) => item.gateType === input.gateType);
    }

    const approvedFeatureIds: string[] = [];
    const failures: { featureId: string; reason: string }[] = [];
    const skipped: { featureId: string; reason: string }[] = [];

    for (const item of candidates) {
      if (input.lowRisk) {
        const gate =
          item.gateType && isGuardrailGateType(item.gateType) ? item.gateType : undefined;
        if (!gate) {
          skipped.push({
            featureId: item.featureId,
            reason: 'Unknown gate type — cannot prove this gate is low-risk',
          });
          continue;
        }

        try {
          const assessment = await this.lowRisk.execute({ featureId: item.featureId, gate });
          if (!assessment.lowRisk) {
            skipped.push({ featureId: item.featureId, reason: assessment.reason });
            continue;
          }
        } catch (err) {
          skipped.push({
            featureId: item.featureId,
            reason: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }

      try {
        const result = await this.approveUseCase.execute(item.runId);
        if (result.approved) {
          approvedFeatureIds.push(item.featureId);
        } else {
          failures.push({ featureId: item.featureId, reason: result.reason });
        }
      } catch (err) {
        failures.push({
          featureId: item.featureId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      totalAttempted: candidates.length,
      approvedCount: approvedFeatureIds.length,
      approvedFeatureIds,
      failedCount: failures.length,
      failures,
      skippedCount: skipped.length,
      skipped,
    };
  }
}
