/**
 * Harness entity factories for tests (spec 119).
 */
import { randomUUID } from 'node:crypto';
import {
  ChunkKind,
  ChunkVisibility,
  HarnessBudgetMode,
  HarnessDecisionKind,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessSessionStatus,
  HarnessTaskStatus,
  HarnessTaskType,
  HarnessToolCallStatus,
  ModelCallStatus,
  PermissionEffect,
  PermissionRequestStatus,
  SensitivityLabel,
  ToolReadWriteMode,
  DecisionProviderKind,
  CacheStrategyMode,
  type ContextChunk,
  type ContextPlan,
  type HarnessDecision,
  type HarnessSession,
  type HarnessTask,
  type HarnessToolCall,
  type ModelCall,
  type PermissionDecision,
} from '@/domain/generated/output.js';

export const T0 = new Date('2026-10-01T10:00:00.000Z');

export function makeSession(overrides: Partial<HarnessSession> = {}): HarnessSession {
  return {
    id: randomUUID(),
    status: HarnessSessionStatus.Active,
    origin: HarnessSessionOrigin.Standalone,
    mode: HarnessMode.QueryAware,
    repoRoot: '/repo',
    title: 'Fix refresh-token expiry',
    shadowContext: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeTask(sessionId: string, overrides: Partial<HarnessTask> = {}): HarnessTask {
  return {
    id: randomUUID(),
    sessionId,
    goal: 'Fix refresh-token expiry',
    normalizedGoal: 'fix refresh-token expiry',
    type: HarnessTaskType.Write,
    status: HarnessTaskStatus.Pending,
    budget: { quality: HarnessBudgetMode.Balanced },
    dedupeKey: 'dk',
    stateVersion: 0,
    turnCount: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeChunk(sessionId: string, overrides: Partial<ContextChunk> = {}): ContextChunk {
  return {
    id: randomUUID(),
    sessionId,
    kind: ChunkKind.File,
    label: 'src/a.ts',
    source: 'read_file',
    contentRef: `sha256:${'a'.repeat(64)}`,
    contentHash: 'a'.repeat(64),
    tokenEstimate: 10,
    sensitivity: SensitivityLabel.Internal,
    pinned: false,
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makePlan(taskId: string, overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    id: randomUUID(),
    taskId,
    turn: 1,
    query: 'q',
    queryFingerprint: 'fp',
    stateVersion: 0,
    chunks: [
      {
        chunkId: 'c1',
        kind: ChunkKind.File,
        label: 'src/a.ts',
        visibility: ChunkVisibility.Full,
        relevance: 0.9,
        tokens: 10,
        rawTokens: 10,
        reasonCode: 'path_match',
        source: 'ai' as never,
      },
    ],
    instructionIds: [],
    capabilityIds: [],
    loadedSchemaIds: [],
    estimatedTokens: 10,
    tokenBudget: 100,
    candidateCount: 1,
    cacheStrategy: { mode: CacheStrategyMode.StablePrefix },
    degraded: false,
    shadow: false,
    overBudget: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeDecision(overrides: Partial<HarnessDecision> = {}): HarnessDecision {
  return {
    id: randomUUID(),
    kind: HarnessDecisionKind.ChunkVisibility,
    providerId: 'deterministic',
    providerKind: DecisionProviderKind.Deterministic,
    question: 'q',
    inputRef: `sha256:${'b'.repeat(64)}`,
    result: { ok: true },
    latencyMs: 1,
    enforced: true,
    shadow: false,
    degraded: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeModelCall(taskId: string, overrides: Partial<ModelCall> = {}): ModelCall {
  return {
    id: randomUUID(),
    taskId,
    turn: 1,
    modelId: 'test-model',
    status: ModelCallStatus.Completed,
    estimatedInputTokens: 100,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeToolCall(
  taskId: string,
  overrides: Partial<HarnessToolCall> = {}
): HarnessToolCall {
  return {
    id: randomUUID(),
    taskId,
    turn: 1,
    capabilityId: 'read_file',
    implementationId: 'builtin.read_file',
    arguments: { path: 'src/a.ts' },
    argumentsHash: 'h',
    idempotencyKey: randomUUID(),
    status: HarnessToolCallStatus.Completed,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makePermission(
  sessionId: string,
  taskId: string,
  overrides: Partial<PermissionDecision> = {}
): PermissionDecision {
  return {
    id: randomUUID(),
    sessionId,
    taskId,
    action: {
      capabilityId: 'run_command',
      actionClass: ToolReadWriteMode.SideEffect,
      summary: 'pnpm add jsonwebtoken@9',
    },
    resources: [],
    effects: [{ category: 'network', description: 'Download packages from registry.npmjs.org' }],
    result: PermissionEffect.Ask,
    status: PermissionRequestStatus.Pending,
    matchedRuleIds: ['ask-network-egress'],
    hard: false,
    reasonCode: 'policy_match',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}
