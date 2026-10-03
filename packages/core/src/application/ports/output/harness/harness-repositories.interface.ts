/**
 * Harness state repositories (spec 119).
 *
 * Six focused ports instead of one god-store: sessions/tasks/snapshots,
 * context (chunks, views, plans), execution (decisions, model calls, tool
 * calls), permissions (decisions, grants) and evals. All are implemented on
 * SQLite in infrastructure; application code depends only on these.
 */
import type {
  ChunkKind,
  ChunkView,
  ChunkVisibility,
  ContextChunk,
  ContextPlan,
  HarnessDecision,
  HarnessDecisionKind,
  HarnessEvalResult,
  HarnessEvalRun,
  HarnessSession,
  HarnessSessionOrigin,
  HarnessTask,
  HarnessToolCall,
  ModelCall,
  PermissionDecision,
  PermissionGrant,
  RepoSnapshot,
} from '../../../../domain/generated/output.js';

export interface ListHarnessSessionsQuery {
  origins?: HarnessSessionOrigin[];
  featureId?: string;
  limit?: number;
}

export interface IHarnessSessionRepository {
  createSession(session: HarnessSession): Promise<void>;
  updateSession(session: HarnessSession): Promise<void>;
  getSession(id: string): Promise<HarnessSession | null>;
  findSessionByAgentRun(agentRunId: string): Promise<HarnessSession | null>;
  listSessions(query?: ListHarnessSessionsQuery): Promise<HarnessSession[]>;

  createTask(task: HarnessTask): Promise<void>;
  updateTask(task: HarnessTask): Promise<void>;
  getTask(id: string): Promise<HarnessTask | null>;
  listTasks(sessionId: string): Promise<HarnessTask[]>;

  putSnapshot(snapshot: RepoSnapshot): Promise<void>;
  getSnapshot(id: string): Promise<RepoSnapshot | null>;
  latestSnapshot(sessionId: string): Promise<RepoSnapshot | null>;
}

export interface ListChunksQuery {
  sessionId: string;
  taskId?: string;
  kinds?: ChunkKind[];
  includeSuperseded?: boolean;
  limit?: number;
}

export interface IHarnessContextRepository {
  putChunk(chunk: ContextChunk): Promise<void>;
  getChunk(id: string): Promise<ContextChunk | null>;
  getChunks(ids: readonly string[]): Promise<ContextChunk[]>;
  listChunks(query: ListChunksQuery): Promise<ContextChunk[]>;
  /** Latest non-superseded chunk for a repository path in a session. */
  /** The newest live chunk of this kind read from this path. */
  findLatestChunkByPath(
    sessionId: string,
    path: string,
    kind: ChunkKind
  ): Promise<ContextChunk | null>;
  /** Link `oldId` → `newId` in both directions. */
  markSuperseded(oldId: string, newId: string): Promise<void>;

  putView(view: ChunkView): Promise<void>;
  findView(
    chunkId: string,
    queryFingerprint: string,
    visibility: ChunkVisibility,
    rendererId: string
  ): Promise<ChunkView | null>;

  putPlan(plan: ContextPlan): Promise<void>;
  getPlan(id: string): Promise<ContextPlan | null>;
  listPlans(taskId: string): Promise<ContextPlan[]>;
}

export interface IHarnessExecutionRepository {
  putDecision(decision: HarnessDecision): Promise<void>;
  getDecision(id: string): Promise<HarnessDecision | null>;
  listDecisions(taskId: string, kind?: HarnessDecisionKind): Promise<HarnessDecision[]>;

  putModelCall(call: ModelCall): Promise<void>;
  getModelCall(id: string): Promise<ModelCall | null>;
  listModelCalls(taskId: string): Promise<ModelCall[]>;

  putToolCall(call: HarnessToolCall): Promise<void>;
  getToolCall(id: string): Promise<HarnessToolCall | null>;
  listToolCalls(taskId: string): Promise<HarnessToolCall[]>;
  findToolCallByIdempotencyKey(key: string): Promise<HarnessToolCall | null>;
}

export interface IHarnessPermissionRepository {
  putPermission(decision: PermissionDecision): Promise<void>;
  getPermission(id: string): Promise<PermissionDecision | null>;
  /**
   * Resolve a pending request. Conditional on status = pending: returns false
   * (and writes nothing) when another resolver already won.
   */
  resolvePending(resolved: PermissionDecision): Promise<boolean>;
  listPending(sessionId?: string): Promise<PermissionDecision[]>;
  listBySession(sessionId: string, limit?: number): Promise<PermissionDecision[]>;

  putGrant(grant: PermissionGrant): Promise<void>;
  listActiveGrants(sessionId: string): Promise<PermissionGrant[]>;
  consumeGrant(id: string): Promise<void>;
}

export interface IHarnessEvalRepository {
  putRun(run: HarnessEvalRun): Promise<void>;
  getRun(id: string): Promise<HarnessEvalRun | null>;
  listRuns(limit?: number): Promise<HarnessEvalRun[]>;
  putResult(result: HarnessEvalResult): Promise<void>;
  listResults(runId: string): Promise<HarnessEvalResult[]>;
}
