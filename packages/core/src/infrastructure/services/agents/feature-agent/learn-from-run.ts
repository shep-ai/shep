/**
 * Learning after a feature run ends (spec 150).
 *
 * Runs in the worker after the graph settles — completed OR failed — because a
 * graph node never runs on the failure path, and failed runs are the ones most
 * worth learning from. Records how the run did on its learned-harness version,
 * then reflects. Never throws and never changes the run's own status.
 */

import type { AgentType, CiFixRecord } from '@/domain/generated/output.js';
import type { RunSignals } from '@/application/use-cases/harness-learning/reflection.types.js';
import type { ReflectOnFeatureRunUseCase } from '@/application/use-cases/harness-learning/reflect-on-feature-run.use-case.js';
import type { RecordVersionOutcomeUseCase } from '@/application/use-cases/harness-learning/record-version-outcome.use-case.js';

type State = Record<string, unknown> | undefined;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function runSignalsFromState(state: State, thrownError?: string): RunSignals {
  const s = state ?? {};
  const error = typeof s.error === 'string' && s.error ? s.error : (thrownError ?? null);
  return {
    merged: s.merged === true,
    ciStatus: typeof s.ciStatus === 'string' ? s.ciStatus : null,
    ciFixAttempts: num(s.ciFixAttempts),
    ciFixHistory: Array.isArray(s.ciFixHistory) ? (s.ciFixHistory as CiFixRecord[]) : [],
    rejectionFeedback: strings(s.feedbackHistory),
    validationRepairs: num(s.validationRetries),
    lastValidationErrors: strings(s.lastValidationErrors),
    error,
  };
}

export interface LearnFromRunDeps {
  reflect: Pick<ReflectOnFeatureRunUseCase, 'execute'>;
  recordOutcome: Pick<RecordVersionOutcomeUseCase, 'execute'>;
  log: (message: string) => void;
}

export interface LearnFromRunInput {
  featureId: string;
  repositoryPath: string;
  worktreePath: string;
  agentType: AgentType;
  agentRunId: string;
  /** The learned-harness version the run used, when any. */
  versionId?: string;
  state?: State;
  thrownError?: string;
}

export async function learnFromRun(
  deps: LearnFromRunDeps,
  input: LearnFromRunInput
): Promise<void> {
  const signals = runSignalsFromState(input.state, input.thrownError);
  if (input.versionId) {
    try {
      await deps.recordOutcome.execute({
        versionId: input.versionId,
        featureId: input.featureId,
        signals,
      });
    } catch (error) {
      deps.log(`[learned-harness] could not record the outcome: ${String(error)}`);
    }
  }
  try {
    const result = await deps.reflect.execute(
      {
        featureId: input.featureId,
        repositoryPath: input.repositoryPath,
        worktreePath: input.worktreePath,
        agentType: input.agentType,
        ...(input.versionId ? { versionId: input.versionId } : {}),
        signals,
      },
      input.agentRunId
    );
    if (!result.skipped) {
      deps.log(
        `[learned-harness] reflection ${result.status ?? 'done'}${result.candidateVersionId ? ` — candidate ${result.candidateVersionId}` : ''} ($${result.costUsd.toFixed(2)})`
      );
    }
  } catch (error) {
    deps.log(`[learned-harness] reflection failed: ${String(error)}`);
  }
}
