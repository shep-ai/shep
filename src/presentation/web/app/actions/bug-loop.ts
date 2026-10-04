'use server';

/**
 * Server actions for the work item Investigation panel (spec 123). The
 * investigation and the fix feature's setup run on in the web server after
 * the action returns; the panel polls for the investigation's outcome.
 */

import { resolve } from '@/lib/server-container';
import type { AgentType, WorkItemInvestigation } from '@shepai/core/domain/generated/output';
import type { InvestigateWorkItemUseCase } from '@shepai/core/application/use-cases/bug-loop/investigate-work-item.use-case';
import type { ApproveHypothesisUseCase } from '@shepai/core/application/use-cases/bug-loop/approve-hypothesis.use-case';
import type { GetWorkItemInvestigationsUseCase } from '@shepai/core/application/use-cases/bug-loop/get-work-item-investigations.use-case';

export type InvestigationOutcome =
  | { ok: true; investigation: WorkItemInvestigation }
  | { ok: false; error: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The work item's latest investigation, if any. */
export async function getLatestInvestigation(
  workItemId: string
): Promise<{ investigation?: WorkItemInvestigation; error?: string }> {
  try {
    const result = await resolve<GetWorkItemInvestigationsUseCase>(
      'GetWorkItemInvestigationsUseCase'
    ).execute(workItemId);
    if (!result.ok) return { error: result.error };
    const [latest] = result.investigations;
    return latest ? { investigation: latest } : {};
  } catch (error: unknown) {
    return { error: message(error) };
  }
}

export async function startInvestigation(input: {
  workItemId: string;
  repositoryPath: string;
  agentType?: AgentType;
}): Promise<InvestigationOutcome> {
  try {
    const useCase = resolve<InvestigateWorkItemUseCase>('InvestigateWorkItemUseCase');
    const started = await useCase.start({
      workItem: input.workItemId,
      repositoryPath: input.repositoryPath,
      ...(input.agentType ? { agentType: input.agentType } : {}),
    });
    if (!started.ok) return started;
    // run() records its own failure; this only guards against a crash before it can.
    useCase.run(started.investigation.id).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[startInvestigation] run failed:', error);
    });
    return { ok: true, investigation: started.investigation };
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}

export async function approveHypothesis(input: {
  workItemId: string;
  investigationId: string;
  hypothesis: number;
  fullSpec: boolean;
}): Promise<{ ok: true; featureId: string } | { ok: false; error: string }> {
  try {
    const result = await resolve<ApproveHypothesisUseCase>('ApproveHypothesisUseCase').execute({
      workItem: input.workItemId,
      investigationId: input.investigationId,
      hypothesis: input.hypothesis,
      fullSpec: input.fullSpec,
    });
    if (!result.ok) return result;
    void result.started.then(({ error }) => {
      // eslint-disable-next-line no-console
      if (error) console.error('[approveHypothesis] fix feature did not start:', error);
    });
    return { ok: true, featureId: result.feature.id };
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}
