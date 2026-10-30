/**
 * RecordVersionOutcomeUseCase (spec 150) — one outcome row per finished
 * feature for the learned-harness version it ran on: CI-fix attempts, gate
 * rejections, schema repairs, agent turns and cost (summed from phase
 * timings), and whether it merged. The regression check reads these rows.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IHarnessRefinementRepository } from '../../ports/output/repositories/harness-refinement-repository.interface.js';
import type { RunSignals } from './reflection.types.js';

@injectable()
export class RecordVersionOutcomeUseCase {
  constructor(
    @inject('IPhaseTimingRepository') private readonly timings: IPhaseTimingRepository,
    @inject('IHarnessRefinementRepository') private readonly runs: IHarnessRefinementRepository
  ) {}

  async execute(input: {
    versionId: string;
    featureId: string;
    signals: RunSignals;
  }): Promise<void> {
    const timings = await this.timings.findByFeatureId(input.featureId);
    const now = new Date();
    await this.runs.upsertOutcome({
      id: randomUUID(),
      versionId: input.versionId,
      featureId: input.featureId,
      ciFixAttempts: input.signals.ciFixAttempts,
      gateRejections: input.signals.rejectionFeedback.length,
      validationRepairs: input.signals.validationRepairs,
      numTurns: timings.reduce((sum, t) => sum + (t.numTurns ?? 0), 0),
      costUsd: timings.reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
      merged: input.signals.merged,
      createdAt: now,
      updatedAt: now,
    });
  }
}
