/**
 * GetHarnessSessionUseCase (spec 119): everything a session page, the feature
 * drawer's Context tab or `shep harness inspect session` shows — tasks with
 * their turns, tool calls and plan summaries, the permission log and totals.
 */
import { inject, injectable } from 'tsyringe';
import {
  PermissionRequestStatus,
  type ContextPlan,
  type HarnessSession,
  type HarnessTask,
  type HarnessToolCall,
  type ModelCall,
  type PermissionDecision,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessContextRepository,
  type IHarnessExecutionRepository,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import { HarnessNotFoundError } from './harness-errors.js';
import { grantScopesFor, type HarnessPermissionItem } from './list-harness-permissions.use-case.js';
import {
  addSummaries,
  emptySummary,
  planHistogram,
  summarizeUsage,
  type HarnessUsageSummary,
} from './harness-metrics.js';

export interface HarnessPlanSummary {
  id: string;
  turn: number;
  estimatedTokens: number;
  tokenBudget: number;
  candidateCount: number;
  degraded: boolean;
  shadow: boolean;
  overBudget: boolean;
  histogram: ReturnType<typeof planHistogram>;
}

export interface HarnessTaskDetail {
  task: HarnessTask;
  usage: HarnessUsageSummary;
  modelCalls: ModelCall[];
  toolCalls: HarnessToolCall[];
  plans: HarnessPlanSummary[];
}

export interface HarnessSessionDetail {
  session: HarnessSession;
  tasks: HarnessTaskDetail[];
  /** Requests waiting for a person, with the scopes they may be granted with. */
  pendingPermissions: HarnessPermissionItem[];
  permissionLog: PermissionDecision[];
  usage: HarnessUsageSummary;
}

export interface GetHarnessSessionInput {
  /** A session id, or a feature AgentRun id (the feature drawer knows only that). */
  id: string;
}

export function summarizePlan(plan: ContextPlan): HarnessPlanSummary {
  return {
    id: plan.id,
    turn: plan.turn,
    estimatedTokens: plan.estimatedTokens,
    tokenBudget: plan.tokenBudget,
    candidateCount: plan.candidateCount,
    degraded: plan.degraded,
    shadow: plan.shadow,
    overBudget: plan.overBudget,
    histogram: planHistogram(plan),
  };
}

@injectable()
export class GetHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.ExecutionRepository)
    private readonly execution: IHarnessExecutionRepository,
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository,
    @inject(HARNESS_TOKENS.PermissionRepository)
    private readonly permissions: IHarnessPermissionRepository
  ) {}

  async execute(input: GetHarnessSessionInput): Promise<HarnessSessionDetail> {
    const session =
      (await this.sessions.getSession(input.id)) ??
      (await this.sessions.findSessionByAgentRun(input.id));
    if (!session) throw new HarnessNotFoundError('session', input.id);

    const tasks: HarnessTaskDetail[] = [];
    let usage = emptySummary();
    for (const task of await this.sessions.listTasks(session.id)) {
      const [modelCalls, toolCalls, plans] = await Promise.all([
        this.execution.listModelCalls(task.id),
        this.execution.listToolCalls(task.id),
        this.context.listPlans(task.id),
      ]);
      const taskUsage = summarizeUsage(modelCalls, toolCalls, plans);
      usage = addSummaries(usage, taskUsage);
      tasks.push({
        task,
        usage: taskUsage,
        modelCalls,
        toolCalls,
        plans: plans.map(summarizePlan),
      });
    }
    const permissionLog = await this.permissions.listBySession(session.id);
    return {
      session,
      tasks,
      pendingPermissions: permissionLog
        .filter((p) => p.status === PermissionRequestStatus.Pending)
        .map((decision) => ({
          decision,
          session,
          approvable: !decision.hard,
          scopes: grantScopesFor(session),
        })),
      permissionLog,
      usage,
    };
  }
}
