/**
 * Batch Approve Features Use Case
 *
 * Provides safe, error-isolated batch approval for features waiting on gates.
 * Approves candidates sequentially to avoid SQLite write lock contention and
 * worktree filesystem race conditions — one conflicted feature must never block
 * the rest of the batch.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependencies: IFleetRepository, ApproveAgentRunUseCase
 */

import { injectable, inject } from 'tsyringe';
import { ApproveAgentRunUseCase } from '../agents/approve-agent-run.use-case.js';
import type { IFleetRepository } from '../../ports/output/repositories/fleet-repository.interface.js';
import {
  FleetTriagePriority,
  FleetTriageCategory,
  GuardrailGateType,
  type FleetTriageItem,
} from '../../../domain/generated/output.js';

export interface BatchApproveFeaturesInput {
  /** When supplied, only these feature IDs are considered. */
  featureIds?: string[];
  /** When supplied (and not `all`), only this gate type is considered. */
  gateType?: GuardrailGateType;
}

export interface BatchApproveResult {
  /** Number of gate candidates considered after filtering. */
  totalAttempted: number;
  approvedCount: number;
  approvedFeatureIds: string[];
  failedCount: number;
  failures: { featureId: string; reason: string }[];
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
    private readonly approveUseCase: ApproveAgentRunUseCase
  ) {}

  /**
   * Executes batch approval sequentially across matching waiting features.
   */
  async execute(input: BatchApproveFeaturesInput = {}): Promise<BatchApproveResult> {
    const triageItems = await this.fleetRepo.listTriageItems({
      priority: FleetTriagePriority.p1,
    });

    let candidates = triageItems.filter(isGateCandidate);

    if (input.featureIds && input.featureIds.length > 0) {
      const allowed = new Set(input.featureIds);
      candidates = candidates.filter((item) => allowed.has(item.featureId));
    }

    if (input.gateType && input.gateType !== GuardrailGateType.all) {
      candidates = candidates.filter((item) => item.gateType === input.gateType);
    }

    const approvedFeatureIds: string[] = [];
    const failures: { featureId: string; reason: string }[] = [];

    for (const item of candidates) {
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
    };
  }
}
