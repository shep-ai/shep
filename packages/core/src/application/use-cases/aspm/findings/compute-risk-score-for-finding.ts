/**
 * ComputeRiskScoreForFindingUseCase (feature 098, phase 5, task-28).
 *
 * Gathers the scoring inputs for a single finding, calls the pure-domain
 * `computeRiskScore` function, appends a new RiskScore history row, and
 * updates `SecurityFinding.currentRiskScoreId` so dashboard reads stay
 * O(1) (research decision "Where should the RiskScore live").
 *
 * Inputs gathered per finding:
 *   - canonical severity + KEV + EPSS percentile from the finding itself
 *     (set by the ingestion pipeline in phase 3/4).
 *   - exposure / criticality / dataClassification from the owning
 *     Application (which the finding hangs off via applicationId).
 *
 * The use case is application-layer only — no infra imports, all
 * dependencies arrive via ports.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import { FindingNotFoundError } from '../../../../domain/aspm/errors/finding-not-found.error.js';
import {
  computeRiskScore,
  type RiskScoreInputs,
} from '../../../../domain/aspm/scoring/compute-risk-score.js';
import type { RiskScore, SecurityFinding } from '../../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IRiskScoreRepository } from '../../../ports/output/repositories/risk-score-repository.interface.js';

export interface ComputeRiskScoreForFindingInput {
  findingId: string;
}

export interface ComputeRiskScoreForFindingResult {
  riskScore: RiskScore;
  finding: SecurityFinding;
}

@injectable()
export class ComputeRiskScoreForFindingUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('IRiskScoreRepository') private readonly riskScoreRepo: IRiskScoreRepository,
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository
  ) {}

  async execute(input: ComputeRiskScoreForFindingInput): Promise<ComputeRiskScoreForFindingResult> {
    const finding = await this.findingRepo.findById(input.findingId);
    if (finding === null) throw new FindingNotFoundError(input.findingId);

    const application = await this.appRepo.findById(finding.applicationId);

    const inputs: RiskScoreInputs = {
      canonicalSeverity: finding.canonicalSeverity,
      epssPercentile: finding.epssPercentile,
      kev: finding.kev,
      exposure: application?.exposure,
      criticality: application?.criticality,
      dataClassification: application?.dataClassification,
    };

    const contribution = computeRiskScore(inputs);
    const now = new Date();
    const riskScore: RiskScore = {
      id: randomUUID(),
      findingId: finding.id,
      total: contribution.total,
      breakdown: {
        total: contribution.total,
        cvssContribution: contribution.cvssContribution,
        epssContribution: contribution.epssContribution,
        kevContribution: contribution.kevContribution,
        exposureContribution: contribution.exposureContribution,
        criticalityContribution: contribution.criticalityContribution,
        dataClassificationContribution: contribution.dataClassificationContribution,
      },
      computedAt: now,
      inputsHash: contribution.inputsHash,
      createdAt: now,
      updatedAt: now,
    };

    await this.riskScoreRepo.append(riskScore);
    await this.findingRepo.update(finding.id, { currentRiskScoreId: riskScore.id });

    return {
      riskScore,
      finding: { ...finding, currentRiskScoreId: riskScore.id },
    };
  }
}
