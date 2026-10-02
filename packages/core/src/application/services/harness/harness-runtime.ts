/**
 * HarnessRuntime (spec 119): runs one harness task end to end.
 *
 *   restore session state → task + repo snapshot → instructions → prompt
 *   sections as chunks → capability registry, router, permissions, context
 *   engine → query-aware or baseline loop → persisted result and usage
 *
 * The runtime is presentation- and provider-agnostic: the model backend,
 * tool sources, policy and storage all arrive through ports.
 */
import { randomUUID } from 'node:crypto';
import {
  ChunkKind,
  HarnessEventType,
  HarnessMode,
  HarnessSessionStatus,
  HarnessTaskOutcome,
  HarnessTaskStatus,
  HarnessTaskType,
  type HarnessConfig,
  type HarnessSession,
  type HarnessTask,
  type HarnessTaskResult,
} from '../../../domain/generated/output.js';
import { dedupeKey, normalizeGoal } from '../../../domain/harness/fingerprints.js';
import {
  splitPromptIntoSections,
  type PromptSection,
} from '../../../domain/harness/prompt-sections.js';
import { assertHarnessTaskTransition } from '../../../domain/harness/task-state-machine.js';
import type {
  IBlobStore,
  ICommandInspector,
  IDecisionProviderFactory,
  IHarnessContextRepository,
  IHarnessEventLog,
  IHarnessExecutionRepository,
  IHarnessModelProvider,
  IHarnessPermissionRepository,
  IHarnessSessionRepository,
  IInstructionSource,
  IPolicyEngine,
  IRepoSnapshotter,
  IToolArgumentValidator,
  IToolSource,
} from '../../ports/output/harness/index.js';
import { ActionDescriber } from './action-describer.js';
import { runBaselineLoop } from './baseline-turn-loop.js';
import { CandidateRetriever } from './candidate-retriever.js';
import { CapabilityRegistry } from './capability-registry.js';
import { CapabilityRouter } from './capability-router.js';
import { ChunkWriter } from './chunk-writer.js';
import { failureResult } from './completion.js';
import { ContextEngine } from './context-engine.js';
import { DecisionService } from './decision-service.js';
import { InstructionResolver } from './instruction-resolver.js';
import { PermissionService } from './permission-service.js';
import { SessionRestorer } from './session-restorer.js';
import { buildSystemPrompt } from './system-prompt.js';
import { ToolInvoker } from './tool-invoker.js';
import type { HarnessUsageTotals, ProgressEvent, TurnContext } from './turn-context.js';
import { TurnLedger } from './turn-ledger.js';
import { runQueryAwareLoop } from './turn-loop.js';
import { STOPPED_BY_USER } from './turn-guard.js';

export interface HarnessRuntimeDeps {
  sessions: IHarnessSessionRepository;
  context: IHarnessContextRepository;
  execution: IHarnessExecutionRepository;
  permissionRepo: IHarnessPermissionRepository;
  events: IHarnessEventLog;
  blobs: IBlobStore;
  snapshotter: IRepoSnapshotter;
  toolSources: IToolSource[];
  validator: IToolArgumentValidator;
  policy: IPolicyEngine;
  inspector: ICommandInspector;
  instructions: IInstructionSource;
  decisionFactory: IDecisionProviderFactory;
  /** Poll interval while waiting for a permission answer (tests shorten it). */
  permissionPollMs?: number;
  /** OS process id recorded on each task, so a stop can tell an orphaned task. */
  processId?: number;
}

export interface RunTaskInput {
  session: HarnessSession;
  goal: string;
  /** The full prompt (baseline shows it as the first message). */
  prompt: string;
  promptSections?: PromptSection[];
  phase?: string;
  cwd: string;
  repoRoot: string;
  config: HarnessConfig;
  model: IHarnessModelProvider;
  taskType?: HarnessTaskType;
  /** Someone can answer permission asks. */
  interactive: boolean;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  testCommand?: string;
  onProgress?: (event: ProgressEvent) => void;
}

export interface RunTaskResult {
  task: HarnessTask;
  result: HarnessTaskResult;
  finalText: string;
  usage: HarnessUsageTotals;
}

export class HarnessRuntime {
  constructor(private readonly deps: HarnessRuntimeDeps) {}

  async runTask(input: RunTaskInput): Promise<RunTaskResult> {
    const d = this.deps;
    const registry = await CapabilityRegistry.fromSources(d.toolSources);
    const restorer = new SessionRestorer(
      d.sessions,
      d.context,
      d.execution,
      d.permissionRepo,
      d.events,
      d.blobs,
      d.snapshotter
    );
    const restored = await restorer.restore(input.session, registry, input.repoRoot);
    const session: HarnessSession = {
      ...input.session,
      status: HarnessSessionStatus.Active,
      updatedAt: new Date(),
    };
    await d.sessions.updateSession(session);

    // Snapshot the repository the task starts from.
    const capture = await d.snapshotter.capture(input.repoRoot);
    const snapshotId = randomUUID();
    await d.sessions.putSnapshot({
      id: snapshotId,
      sessionId: session.id,
      root: capture.root,
      ...(capture.gitCommit && { gitCommit: capture.gitCommit }),
      workingTreeHash: capture.workingTreeHash,
      ...(capture.stagedDiffHash && { stagedDiffHash: capture.stagedDiffHash }),
      ...(capture.unstagedDiffHash && { unstagedDiffHash: capture.unstagedDiffHash }),
      fileHashesRef: await d.blobs.put(JSON.stringify(capture.fileHashes)),
      fileCount: Object.keys(capture.fileHashes).length,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const now = new Date();
    const taskType = input.taskType ?? HarnessTaskType.Write;
    const task: HarnessTask = {
      id: randomUUID(),
      sessionId: session.id,
      goal: input.goal,
      normalizedGoal: normalizeGoal(input.goal),
      type: taskType,
      status: HarnessTaskStatus.Pending,
      ...(input.phase && { phase: input.phase }),
      repoSnapshotId: snapshotId,
      budget: { quality: input.config.budgetMode },
      dedupeKey: dedupeKey({
        goal: input.goal,
        scope: [input.repoRoot],
        repoSnapshotId: capture.workingTreeHash,
        type: taskType,
      }),
      stateVersion: 0,
      turnCount: 0,
      ...(d.processId !== undefined && { ownerPid: d.processId }),
      createdAt: now,
      updatedAt: now,
    };
    await d.sessions.createTask(task);
    await d.events.append({
      sessionId: session.id,
      taskId: task.id,
      type: HarnessEventType.TaskCreated,
      payload: {
        goal: input.goal.slice(0, 500),
        phase: input.phase ?? null,
        mode: session.mode,
        repoSnapshotId: snapshotId,
      },
    });
    const setTaskStatus = async (status: HarnessTaskStatus) => {
      if (task.status === status) return;
      assertHarnessTaskTransition(task.status, status);
      task.status = status;
      task.stateVersion += 1;
      task.updatedAt = new Date();
      await d.sessions.updateTask(task);
      await d.events.append({
        sessionId: session.id,
        taskId: task.id,
        type: HarnessEventType.TaskStatusChanged,
        payload: { status },
      });
    };
    await setTaskStatus(HarnessTaskStatus.Running);

    const writer = new ChunkWriter(d.context, d.blobs);
    const resolved = await new InstructionResolver(d.instructions, d.blobs).resolve(input.repoRoot);
    for (const i of resolved.active) {
      await d.events.append({
        sessionId: session.id,
        taskId: task.id,
        type: HarnessEventType.InstructionActivated,
        payload: { instructionId: i.id, source: i.source },
      });
    }
    const sections = input.promptSections ?? splitPromptIntoSections(input.prompt);
    const sectionIds: string[] = [];
    for (const s of sections) {
      const chunk = await writer.write({
        sessionId: session.id,
        taskId: task.id,
        kind: ChunkKind.PromptSection,
        label: s.title,
        source: `prompt:${s.id}`,
        content: s.content,
        pinned: s.pinned,
        repoSnapshotId: snapshotId,
        ...(s.sourcePath && { path: `prompt:${s.sourcePath}` }),
      });
      sectionIds.push(chunk.id);
    }
    if (restored.unknownSideEffects.length > 0) {
      const note = await writer.write({
        sessionId: session.id,
        taskId: task.id,
        kind: ChunkKind.PromptSection,
        label: 'Recovery note',
        source: 'restore',
        content: `## Recovery note\nThe previous run stopped while these actions were running; their outcome is unknown:\n${restored.unknownSideEffects.map((u) => `- ${u.summary}`).join('\n')}\nCheck the current state (for example with git_inspect) before repeating any of them.\n`,
        pinned: true,
      });
      sectionIds.unshift(note.id);
    }

    const decisions = new DecisionService(
      input.config.decisions,
      d.decisionFactory,
      d.execution,
      d.blobs,
      d.events
    );
    const permissions = new PermissionService(d.policy, d.permissionRepo, d.events, {
      pollMs: d.permissionPollMs,
    });
    const engine = new ContextEngine(
      new CandidateRetriever(d.context),
      d.context,
      d.blobs,
      decisions,
      d.events
    );
    const router = new CapabilityRouter(registry, decisions, {
      shadow: input.config.shadow.toolRouter,
    });
    const mode = session.mode;
    const toolCtx = {
      cwd: input.cwd,
      repoRoot: input.repoRoot,
      timeoutMs: Math.max(1000, Math.min(input.timeoutMs, 30 * 60 * 1000)),
      ...(input.abortSignal && { abortSignal: input.abortSignal }),
      ...(input.testCommand && { testCommand: input.testCommand }),
    };
    const invoker = new ToolInvoker({
      registry,
      validator: d.validator,
      describer: new ActionDescriber(d.inspector),
      permissions,
      policy: d.policy,
      execution: d.execution,
      writer,
      events: d.events,
      permissionsConfig: input.config.permissions,
      interactive: input.interactive,
      unknownSideEffects: new Set(restored.unknownSideEffects.map((u) => u.key)),
      setTaskStatus,
    });
    const tc: TurnContext = {
      session,
      task,
      config: input.config,
      model: input.model,
      system: buildSystemPrompt({
        mode,
        capabilityCatalog: registry.snippetCatalog(),
        instructions: resolved.active,
        repoRoot: input.repoRoot,
      }),
      goal: input.goal,
      prompt: input.prompt,
      promptSectionChunkIds: sectionIds,
      instructionIds: resolved.active.map((i) => i.id),
      repoSnapshotId: snapshotId,
      toolCtx,
      registry,
      router,
      engine,
      invoker,
      writer,
      ledger: new TurnLedger(),
      escalations: new Map(),
      userIncludes: new Set(),
      loadedImplementationIds: new Set(),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 0,
        turns: 0,
        apiLatencyMs: 0,
      },
      maxTurns: input.config.maxTurns,
      shadowContext: session.shadowContext,
      ...(input.abortSignal && { abortSignal: input.abortSignal }),
      execution: d.execution,
      context: d.context,
      sessions: d.sessions,
      events: d.events,
      blobs: d.blobs,
      setTaskStatus,
      progress: (e) => input.onProgress?.(e),
    };

    let outcome;
    try {
      outcome =
        mode === HarnessMode.Baseline ? await runBaselineLoop(tc) : await runQueryAwareLoop(tc);
    } catch (error) {
      const message = (error as Error).message;
      task.result = failureResult(message, []);
      task.failureReason = message;
      await setTaskStatus(
        input.abortSignal?.aborted ? HarnessTaskStatus.Cancelled : HarnessTaskStatus.Failed
      );
      await d.events.append({
        sessionId: session.id,
        taskId: task.id,
        type: HarnessEventType.TaskFailed,
        payload: { reason: message },
      });
      throw error;
    }
    task.result = outcome.result;
    const ok = outcome.result.status !== HarnessTaskOutcome.Failure;
    if (!ok) task.failureReason = outcome.result.summary;
    const cancelled = input.abortSignal?.aborted === true || outcome.finalText === STOPPED_BY_USER;
    await setTaskStatus(
      cancelled
        ? HarnessTaskStatus.Cancelled
        : ok
          ? HarnessTaskStatus.Completed
          : HarnessTaskStatus.Failed
    );
    await d.events.append({
      sessionId: session.id,
      taskId: task.id,
      type: ok ? HarnessEventType.TaskCompleted : HarnessEventType.TaskFailed,
      payload: {
        status: outcome.result.status,
        summary: outcome.result.summary.slice(0, 1000),
        turns: tc.usage.turns,
      },
    });
    input.onProgress?.({ kind: 'result', message: outcome.result.summary });
    return { task, result: outcome.result, finalText: outcome.finalText, usage: tc.usage };
  }
}
