'use server';

import { resolve } from '@/lib/server-container';
import type { IPhaseTimingRepository } from '@shepai/core/application/ports/output/agents/phase-timing-repository.interface';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';

export interface PhaseTimingData {
  agentRunId: string;
  phase: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  waitingApprovalAt?: string;
  approvalWaitMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  costUsd?: number;
  numTurns?: number;
  durationApiMs?: number;
  exitCode?: string;
  errorMessage?: string;
  prompt?: string;
  /** Model this phase actually ran on — differs per phase under adaptive routing. */
  modelId?: string;
}

export interface RejectionFeedbackData {
  iteration: number;
  message: string;
  phase?: string;
  timestamp?: string;
  attachments?: string[];
}

type GetPhaseTimingsResult =
  | { timings: PhaseTimingData[]; rejectionFeedback: RejectionFeedbackData[] }
  | { error: string };

export async function getFeaturePhaseTimings(featureId: string): Promise<GetPhaseTimingsResult> {
  if (!featureId.trim()) {
    return { error: 'Feature id is required' };
  }

  try {
    const repo = resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
    const phaseTimings = await repo.findByFeatureId(featureId);

    const timings: PhaseTimingData[] = phaseTimings.map((t) => ({
      agentRunId: t.agentRunId,
      phase: t.phase,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      durationMs: t.durationMs != null ? Number(t.durationMs) : undefined,
      waitingApprovalAt: t.waitingApprovalAt,
      approvalWaitMs: t.approvalWaitMs != null ? Number(t.approvalWaitMs) : undefined,
      inputTokens: t.inputTokens != null ? Number(t.inputTokens) : undefined,
      outputTokens: t.outputTokens != null ? Number(t.outputTokens) : undefined,
      cacheCreationInputTokens:
        t.cacheCreationInputTokens != null ? Number(t.cacheCreationInputTokens) : undefined,
      cacheReadInputTokens:
        t.cacheReadInputTokens != null ? Number(t.cacheReadInputTokens) : undefined,
      costUsd: t.costUsd != null ? Number(t.costUsd) : undefined,
      numTurns: t.numTurns ?? undefined,
      durationApiMs: t.durationApiMs != null ? Number(t.durationApiMs) : undefined,
      exitCode: t.exitCode ?? undefined,
      errorMessage: t.errorMessage ?? undefined,
      prompt: t.prompt ?? undefined,
      modelId: t.modelId ?? undefined,
    }));

    // Read rejection feedback from spec.yaml
    const rejectionFeedback = await readRejectionFeedback(featureId);

    return { timings, rejectionFeedback };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load phase timings';
    return { error: message };
  }
}

async function readRejectionFeedback(featureId: string): Promise<RejectionFeedbackData[]> {
  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const feature = await featureRepo.findById(featureId);
    if (!feature?.specPath) return [];

    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const yaml = (await import('js-yaml')).default;

    const specContent = readFileSync(join(feature.specPath, 'spec.yaml'), 'utf-8');
    const spec = yaml.load(specContent) as Record<string, unknown>;

    if (!Array.isArray(spec?.rejectionFeedback)) return [];

    return (spec.rejectionFeedback as Record<string, unknown>[]).map((entry) => ({
      iteration: Number(entry.iteration ?? 1),
      message: String(entry.message ?? ''),
      phase: entry.phase ? String(entry.phase) : undefined,
      timestamp: entry.timestamp ? String(entry.timestamp) : undefined,
      attachments: Array.isArray(entry.attachments)
        ? (entry.attachments as unknown[]).map(String)
        : undefined,
    }));
  } catch {
    return [];
  }
}
