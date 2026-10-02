/**
 * OverrideChunkVisibilityUseCase (spec 119, F6 "Include from next turn"): a
 * person marks a chunk as needed. It is persisted as a user-sourced
 * HarnessDecision on the session's running task (or the plan's task) and the
 * context engine honours it like a pin from the next turn on.
 */
import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  DecisionProviderKind,
  HarnessDecisionKind,
  HarnessEventType,
  HarnessTaskStatus,
  type HarnessDecision,
} from '../../../domain/generated/output.js';
import { canonicalJson } from '../../../domain/harness/fingerprints.js';
import {
  HARNESS_TOKENS,
  type IBlobStore,
  type IHarnessContextRepository,
  type IHarnessEventLog,
  type IHarnessExecutionRepository,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import {
  USER_DECISION_PROVIDER_ID,
  type UserIncludeResult,
} from '../../services/harness/turn-guard.js';
import { HarnessNotFoundError } from './harness-errors.js';

export interface OverrideChunkVisibilityInput {
  chunkId: string;
  /** The plan the person was looking at. */
  planId: string;
  include: boolean;
}

const LIVE: ReadonlySet<HarnessTaskStatus> = new Set([
  HarnessTaskStatus.Running,
  HarnessTaskStatus.Blocked,
]);

@injectable()
export class OverrideChunkVisibilityUseCase {
  constructor(
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository,
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.ExecutionRepository)
    private readonly execution: IHarnessExecutionRepository,
    @inject(HARNESS_TOKENS.BlobStore) private readonly blobs: IBlobStore,
    @inject(HARNESS_TOKENS.EventLog) private readonly events: IHarnessEventLog
  ) {}

  async execute(input: OverrideChunkVisibilityInput): Promise<HarnessDecision> {
    const plan = await this.context.getPlan(input.planId);
    if (!plan) throw new HarnessNotFoundError('context plan', input.planId);
    const chunk = await this.context.getChunk(input.chunkId);
    if (!chunk) throw new HarnessNotFoundError('chunk', input.chunkId);
    const tasks = await this.sessions.listTasks(chunk.sessionId);
    const target =
      tasks.filter((t) => LIVE.has(t.status)).at(-1) ?? tasks.find((t) => t.id === plan.taskId);
    const result: UserIncludeResult = { chunkId: chunk.id, include: input.include };
    const now = new Date();
    const decision: HarnessDecision = {
      id: randomUUID(),
      taskId: target?.id ?? plan.taskId,
      kind: HarnessDecisionKind.ChunkVisibility,
      providerId: USER_DECISION_PROVIDER_ID,
      providerKind: DecisionProviderKind.Deterministic,
      question: `${input.include ? 'Include' : 'Stop including'} ${chunk.label}`,
      inputRef: await this.blobs.put(canonicalJson(input)),
      result: { ...result },
      latencyMs: 0,
      enforced: true,
      shadow: false,
      degraded: false,
      contextPlanId: plan.id,
      createdAt: now,
      updatedAt: now,
    };
    await this.execution.putDecision(decision);
    await this.events.append({
      sessionId: chunk.sessionId,
      taskId: decision.taskId,
      type: HarnessEventType.DecisionRecorded,
      payload: {
        decisionId: decision.id,
        kind: decision.kind,
        providerId: USER_DECISION_PROVIDER_ID,
        chunkId: chunk.id,
        include: input.include,
      },
    });
    return decision;
  }
}
