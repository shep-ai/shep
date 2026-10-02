'use server';

/**
 * Read-side server actions of the query-aware harness (spec 119). Each one
 * resolves a harness use case; nothing here holds business logic.
 */
import { resolve } from '@/lib/server-container';
import { toHarnessResult as run, type HarnessResult } from '@/lib/harness-result';
import type { ChunkVisibility } from '@shepai/core/domain/generated/output';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type {
  HarnessSessionListItem,
  ListHarnessSessionsUseCase,
} from '@shepai/core/application/use-cases/harness/list-harness-sessions.use-case';
import type {
  GetHarnessSessionUseCase,
  HarnessSessionDetail,
} from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import type {
  ContextPlanDetail,
  GetContextPlanUseCase,
} from '@shepai/core/application/use-cases/harness/get-context-plan.use-case';
import type {
  RenderChunkViewUseCase,
  RenderedChunkView,
} from '@shepai/core/application/use-cases/harness/render-chunk-view.use-case';
import type {
  ExplainHarnessDecisionInput,
  ExplainHarnessDecisionUseCase,
  HarnessDecisionExplanation,
} from '@shepai/core/application/use-cases/harness/explain-harness-decision.use-case';
import type {
  HarnessPermissionItem,
  ListHarnessPermissionsInput,
  ListHarnessPermissionsUseCase,
} from '@shepai/core/application/use-cases/harness/list-harness-permissions.use-case';
import type {
  HarnessCapabilityItem,
  ListHarnessCapabilitiesUseCase,
} from '@shepai/core/application/use-cases/harness/list-harness-capabilities.use-case';
import type {
  GetHarnessPoliciesUseCase,
  HarnessPolicies,
} from '@shepai/core/application/use-cases/harness/get-harness-policies.use-case';

export async function listHarnessSessions(
  featureId?: string
): Promise<HarnessResult<HarnessSessionListItem[]>> {
  return run(() =>
    resolve<ListHarnessSessionsUseCase>('ListHarnessSessionsUseCase').execute(
      featureId ? { featureId } : {}
    )
  );
}

export async function getHarnessSession(id: string): Promise<HarnessResult<HarnessSessionDetail>> {
  return run(() => resolve<GetHarnessSessionUseCase>('GetHarnessSessionUseCase').execute({ id }));
}

/** The latest harness session of a feature (its current AgentRun), or null. */
export async function getHarnessSessionForFeature(
  featureId: string
): Promise<HarnessResult<HarnessSessionDetail | null>> {
  return run(async () => {
    const [latest] = await resolve<ListHarnessSessionsUseCase>(
      'ListHarnessSessionsUseCase'
    ).execute({ featureId, limit: 1 });
    if (!latest) return null;
    return resolve<GetHarnessSessionUseCase>('GetHarnessSessionUseCase').execute({
      id: latest.session.id,
    });
  });
}

export async function getHarnessContextPlan(
  planId: string
): Promise<HarnessResult<ContextPlanDetail>> {
  return run(() => resolve<GetContextPlanUseCase>('GetContextPlanUseCase').execute({ planId }));
}

export async function renderHarnessChunk(
  chunkId: string,
  visibility: ChunkVisibility
): Promise<HarnessResult<RenderedChunkView>> {
  return run(() =>
    resolve<RenderChunkViewUseCase>('RenderChunkViewUseCase').execute({ chunkId, visibility })
  );
}

export async function explainHarnessDecision(
  input: ExplainHarnessDecisionInput
): Promise<HarnessResult<HarnessDecisionExplanation>> {
  return run(() =>
    resolve<ExplainHarnessDecisionUseCase>('ExplainHarnessDecisionUseCase').execute(input)
  );
}

export async function listHarnessPermissions(
  input: ListHarnessPermissionsInput = {}
): Promise<HarnessResult<HarnessPermissionItem[]>> {
  return run(() =>
    resolve<ListHarnessPermissionsUseCase>('ListHarnessPermissionsUseCase').execute(input)
  );
}

export async function listHarnessCapabilities(): Promise<HarnessResult<HarnessCapabilityItem[]>> {
  return run(() =>
    resolve<ListHarnessCapabilitiesUseCase>('ListHarnessCapabilitiesUseCase').execute()
  );
}

export async function getHarnessPolicies(
  repoRoot: string
): Promise<HarnessResult<HarnessPolicies>> {
  return run(() =>
    resolve<GetHarnessPoliciesUseCase>('GetHarnessPoliciesUseCase').execute({ repoRoot })
  );
}

/** Paths of the repositories Shep knows, for the New task and setup pickers. */
export async function listHarnessRepositoryPaths(): Promise<HarnessResult<string[]>> {
  return run(async () => {
    const repos = await resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase').execute();
    return repos.map((r) => r.path).filter((p): p is string => Boolean(p));
  });
}
