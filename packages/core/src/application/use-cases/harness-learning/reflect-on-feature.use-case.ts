/**
 * ReflectOnFeatureUseCase (spec 150) — `shep learn reflect <feature>`: a
 * person asks Shep to learn from a feature's last run after the fact. Finds the
 * feature (full id or prefix) and its agent run, rebuilds the run signals the
 * feature still carries, and runs the Reflect loop as a manual request, so it
 * works even while the learning mode is Off (never while the flag is off).
 */

import { inject, injectable } from 'tsyringe';
import { PrStatus, SdlcLifecycle, type Feature } from '../../../domain/generated/output.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import {
  ReflectOnFeatureRunUseCase,
  type ReflectOnFeatureRunResult,
} from './reflect-on-feature-run.use-case.js';
import type { RunSignals } from './reflection.types.js';

const skipped = (reason: string): ReflectOnFeatureRunResult => ({
  skipped: true,
  reason,
  costUsd: 0,
});

/** What a feature still records about its last run. */
function storedSignals(feature: Feature): RunSignals {
  const pr = feature.pr;
  return {
    merged: pr?.status === PrStatus.Merged || feature.lifecycle === SdlcLifecycle.Maintain,
    ciStatus: pr?.ciStatus ?? null,
    ciFixAttempts: pr?.ciFixAttempts ?? 0,
    ciFixHistory: pr?.ciFixHistory ?? [],
    rejectionFeedback: [],
    validationRepairs: 0,
    lastValidationErrors: [],
    error: null,
  };
}

@injectable()
export class ReflectOnFeatureUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IAgentRunRepository') private readonly runs: IAgentRunRepository,
    @inject(ReflectOnFeatureRunUseCase) private readonly reflect: ReflectOnFeatureRunUseCase
  ) {}

  async execute(input: { featureId: string }): Promise<ReflectOnFeatureRunResult> {
    const feature =
      (await this.features.findById(input.featureId)) ??
      (await this.features.findByIdPrefix(input.featureId));
    if (!feature) return skipped(`feature ${input.featureId} not found`);
    const run = feature.agentRunId ? await this.runs.findById(feature.agentRunId) : null;
    if (!run?.agentType) return skipped('the feature has no agent run to learn from');

    return this.reflect.execute(
      {
        featureId: feature.id,
        repositoryPath: feature.repositoryPath,
        worktreePath: feature.worktreePath ?? feature.repositoryPath,
        agentType: run.agentType,
        manual: true,
        signals: storedSignals(feature),
      },
      run.id
    );
  }
}
