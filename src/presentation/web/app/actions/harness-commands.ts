'use server';

/**
 * Write-side server actions of the query-aware harness (spec 119): answer
 * permission requests, steer context, start/stop standalone tasks and decide
 * their outcome, set up a repository.
 */
import { resolve } from '@/lib/server-container';
import { toHarnessResult as run, type HarnessResult } from '@/lib/harness-result';
import type {
  GrantScope,
  HarnessDecision,
  HarnessSession,
} from '@shepai/core/domain/generated/output';
import type { ResolveHarnessPermissionUseCase } from '@shepai/core/application/use-cases/harness/resolve-harness-permission.use-case';
import type { OverrideChunkVisibilityUseCase } from '@shepai/core/application/use-cases/harness/override-chunk-visibility.use-case';
import type { RunHarnessTaskUseCase } from '@shepai/core/application/use-cases/harness/run-harness-task.use-case';
import type { ResumeHarnessSessionUseCase } from '@shepai/core/application/use-cases/harness/resume-harness-session.use-case';
import type {
  StopHarnessSessionResult,
  StopHarnessSessionUseCase,
} from '@shepai/core/application/use-cases/harness/stop-harness-session.use-case';
import type {
  ApplyHarnessSessionResult,
  ApplyHarnessSessionUseCase,
} from '@shepai/core/application/use-cases/harness/apply-harness-session.use-case';
import type { PromoteHarnessSessionUseCase } from '@shepai/core/application/use-cases/harness/promote-harness-session.use-case';
import type { DiscardHarnessSessionUseCase } from '@shepai/core/application/use-cases/harness/discard-harness-session.use-case';
import type {
  InitHarnessProjectResult,
  InitHarnessProjectUseCase,
} from '@shepai/core/application/use-cases/harness/init-harness-project.use-case';
import type { RunHarnessEvalUseCase } from '@shepai/core/application/use-cases/harness/run-harness-eval.use-case';
import type { HarnessRunOverrides } from '@shepai/core/application/services/harness/harness-task-service';

export interface ResolveHarnessPermissionRequest {
  id: string;
  allow: boolean;
  scope?: GrantScope;
  note?: string;
}

export async function resolveHarnessPermission(
  req: ResolveHarnessPermissionRequest
): Promise<HarnessResult<{ id: string }>> {
  return run(async () => {
    const d = await resolve<ResolveHarnessPermissionUseCase>(
      'ResolveHarnessPermissionUseCase'
    ).execute({ ...req, resolvedBy: 'web' });
    return { id: d.id };
  });
}

export async function includeHarnessChunk(
  planId: string,
  chunkId: string,
  include: boolean
): Promise<HarnessResult<HarnessDecision>> {
  return run(() =>
    resolve<OverrideChunkVisibilityUseCase>('OverrideChunkVisibilityUseCase').execute({
      planId,
      chunkId,
      include,
    })
  );
}

export interface StartHarnessTaskRequest {
  repoRoot: string;
  task: string;
  modelId?: string;
  overrides?: HarnessRunOverrides;
}

/**
 * Create the session and worktree, then run the task in the background of the
 * web server; the session page follows it live and answers its permission
 * requests.
 */
export async function startHarnessTask(
  req: StartHarnessTaskRequest
): Promise<HarnessResult<HarnessSession>> {
  return run(async () => {
    const session = await resolve<RunHarnessTaskUseCase>('RunHarnessTaskUseCase').prepare(req);
    void resolve<ResumeHarnessSessionUseCase>('ResumeHarnessSessionUseCase')
      .execute({ sessionId: session.id, task: req.task, interactive: true })
      .catch(() => undefined);
    return session;
  });
}

export async function stopHarnessSession(
  sessionId: string
): Promise<HarnessResult<StopHarnessSessionResult>> {
  return run(() =>
    resolve<StopHarnessSessionUseCase>('StopHarnessSessionUseCase').execute({ sessionId })
  );
}

export async function applyHarnessSession(
  sessionId: string,
  branch?: string
): Promise<HarnessResult<ApplyHarnessSessionResult>> {
  return run(() =>
    resolve<ApplyHarnessSessionUseCase>('ApplyHarnessSessionUseCase').execute({
      sessionId,
      ...(branch && { branch }),
    })
  );
}

export async function promoteHarnessSession(
  sessionId: string
): Promise<HarnessResult<{ featureId: string }>> {
  return run(async () => {
    const r = await resolve<PromoteHarnessSessionUseCase>('PromoteHarnessSessionUseCase').execute({
      sessionId,
    });
    return { featureId: r.feature.id };
  });
}

export async function discardHarnessSession(
  sessionId: string
): Promise<HarnessResult<HarnessSession>> {
  return run(() =>
    resolve<DiscardHarnessSessionUseCase>('DiscardHarnessSessionUseCase').execute({ sessionId })
  );
}

export async function setUpHarnessRepository(
  repoRoot: string,
  confirm: boolean
): Promise<HarnessResult<InitHarnessProjectResult>> {
  return run(() =>
    resolve<InitHarnessProjectUseCase>('InitHarnessProjectUseCase').execute({ repoRoot, confirm })
  );
}

export interface StartHarnessEvalRequest {
  suite: string;
  repoRoot?: string;
  repeats?: number;
}

/** Record the eval run and execute it in the background; the Evals tab polls its report. */
export async function startHarnessEval(
  req: StartHarnessEvalRequest
): Promise<HarnessResult<{ runId: string }>> {
  return run(async () => {
    const runner = resolve<RunHarnessEvalUseCase>('RunHarnessEvalUseCase');
    const started = await runner.start(req);
    void runner.execute(req, started).catch(() => undefined);
    return { runId: started.id };
  });
}
