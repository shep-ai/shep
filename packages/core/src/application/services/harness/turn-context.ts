/**
 * Shared state of one harness task's turn loop (spec 119).
 */
import type {
  ChunkVisibility,
  HarnessConfig,
  HarnessSession,
  HarnessTask,
  HarnessTaskResult,
  HarnessTaskStatus,
} from '../../../domain/generated/output.js';
import type {
  IBlobStore,
  IHarnessContextRepository,
  IHarnessEventLog,
  IHarnessExecutionRepository,
  IHarnessSessionRepository,
  IHarnessModelProvider,
  ToolExecutionContext,
} from '../../ports/output/harness/index.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { CapabilityRouter } from './capability-router.js';
import type { ChunkWriter } from './chunk-writer.js';
import type { ContextEngine } from './context-engine.js';
import type { ToolInvoker } from './tool-invoker.js';
import type { TurnLedger } from './turn-ledger.js';

export interface HarnessUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** undefined once any call reported no cost: never summed as zero. */
  costUsd: number | undefined;
  turns: number;
  apiLatencyMs: number;
}

export type ProgressKind = 'turn' | 'tool' | 'permission' | 'plan' | 'result';

export interface ProgressEvent {
  kind: ProgressKind;
  message: string;
}

export interface TurnContext {
  session: HarnessSession;
  task: HarnessTask;
  config: HarnessConfig;
  model: IHarnessModelProvider;
  system: string;
  goal: string;
  prompt: string;
  promptSectionChunkIds: string[];
  instructionIds: string[];
  repoSnapshotId?: string;
  toolCtx: ToolExecutionContext;
  registry: CapabilityRegistry;
  router: CapabilityRouter;
  engine: ContextEngine;
  invoker: ToolInvoker;
  writer: ChunkWriter;
  ledger: TurnLedger;
  escalations: Map<string, ChunkVisibility>;
  userIncludes: Set<string>;
  loadedImplementationIds: Set<string>;
  usage: HarnessUsageTotals;
  maxTurns: number;
  shadowContext: boolean;
  abortSignal?: AbortSignal;
  execution: IHarnessExecutionRepository;
  context: IHarnessContextRepository;
  sessions: IHarnessSessionRepository;
  events: IHarnessEventLog;
  blobs: IBlobStore;
  setTaskStatus: (status: HarnessTaskStatus) => Promise<void>;
  progress: (event: ProgressEvent) => void;
}

export interface LoopOutcome {
  result: HarnessTaskResult;
  finalText: string;
}
