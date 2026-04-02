#!/usr/bin/env node
/**
 * Feature Agent Worker
 *
 * Background worker entry point that runs as a child process via fork().
 * Initializes DI, creates the feature agent graph, and executes it.
 * Sends periodic heartbeats so the CLI can detect stuck/crashed workers.
 *
 * CLI Args: --feature-id <id> --run-id <id> --repo <path> --spec-dir <path>
 */

import 'reflect-metadata';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from '@langchain/langgraph';
import { initializeContainer, container } from '@/infrastructure/di/container.js';
import { createFeatureAgentGraph } from './feature-agent-graph.js';
import type { FeatureAgentGraphDeps } from './feature-agent-graph.js';
import { createFastFeatureAgentGraph } from './fast-feature-agent-graph.js';
import type { FastFeatureAgentGraphDeps } from './fast-feature-agent-graph.js';
import { createCheckpointer } from '../common/checkpointer.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface.js';
import {
  AgentRunStatus,
  SdlcLifecycle,
  FeatureMode,
  type AgentType,
} from '@/domain/generated/output.js';
import { initializeSettings } from '@/infrastructure/services/settings.service.js';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';
import { setHeartbeatContext } from './heartbeat.js';
import { setPhaseTimingContext, recordLifecycleEvent } from './phase-timing-context.js';
import { setLifecycleContext } from './lifecycle-context.js';
import { setLogPrefix, getLogPrefix } from './log-context.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { UpdateFeatureLifecycleUseCase } from '@/application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import { CleanupFeatureWorktreeUseCase } from '@/application/use-cases/features/cleanup-feature-worktree.use-case.js';

import type { ApprovalGates } from '@/domain/generated/output.js';

export interface WorkerArgs {
  featureId: string;
  runId: string;
  repo: string;
  specDir: string;
  worktreePath?: string;
  approvalGates?: ApprovalGates;
  resume?: boolean;
  threadId?: string;
  resumeFromInterrupt?: boolean;
  push?: boolean;
  openPr?: boolean;
  forkAndPr?: boolean;
  commitSpecs?: boolean;
  ciWatchEnabled?: boolean;
  enableEvidence?: boolean;
  commitEvidence?: boolean;
  resumePayload?: string;
  agentType?: AgentType;
  mode?: FeatureMode;
  model?: string;
  resumeReason?: string;
}

/**
 * Parse CLI arguments into a WorkerArgs object.
 * Throws if any required argument is missing.
 */
export function parseWorkerArgs(args: string[]): WorkerArgs {
  const getArg = (name: string): string => {
    const index = args.indexOf(`--${name}`);
    if (index === -1 || index + 1 >= args.length) {
      throw new Error(`Missing required argument: --${name}`);
    }
    return args[index + 1];
  };

  const worktreeIdx = args.indexOf('--worktree-path');
  const worktreePath =
    worktreeIdx !== -1 && worktreeIdx + 1 < args.length ? args[worktreeIdx + 1] : undefined;

  const approvalIdx = args.indexOf('--approval-gates');
  let approvalGates: ApprovalGates | undefined;
  if (approvalIdx !== -1 && approvalIdx + 1 < args.length) {
    try {
      approvalGates = JSON.parse(args[approvalIdx + 1]) as ApprovalGates;
    } catch {
      // Fall back to no gates if JSON parse fails
      approvalGates = undefined;
    }
  }

  const resume = args.includes('--resume');
  const resumeFromInterrupt = args.includes('--resume-from-interrupt');
  const push = args.includes('--push');
  const openPr = args.includes('--open-pr');
  const forkAndPr = args.includes('--fork-and-pr');
  const commitSpecs = !args.includes('--no-commit-specs');
  const ciWatchEnabled = !args.includes('--no-ci-watch');
  const enableEvidence = args.includes('--enable-evidence');
  const commitEvidence = args.includes('--commit-evidence');
  const modeIdx = args.indexOf('--mode');
  const mode: FeatureMode =
    modeIdx !== -1 && modeIdx + 1 < args.length
      ? (args[modeIdx + 1] as FeatureMode)
      : FeatureMode.Regular;
  const threadIdx = args.indexOf('--thread-id');
  const threadId =
    threadIdx !== -1 && threadIdx + 1 < args.length ? args[threadIdx + 1] : undefined;

  const agentTypeIdx = args.indexOf('--agent-type');
  const agentType =
    agentTypeIdx !== -1 && agentTypeIdx + 1 < args.length
      ? (args[agentTypeIdx + 1] as AgentType)
      : undefined;

  const resumePayloadIdx = args.indexOf('--resume-payload');
  const resumePayload =
    resumePayloadIdx !== -1 && resumePayloadIdx + 1 < args.length
      ? args[resumePayloadIdx + 1]
      : undefined;

  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 && modelIdx + 1 < args.length ? args[modelIdx + 1] : undefined;

  const resumeReasonIdx = args.indexOf('--resume-reason');
  const resumeReason =
    resumeReasonIdx !== -1 && resumeReasonIdx + 1 < args.length
      ? args[resumeReasonIdx + 1]
      : undefined;

  return {
    featureId: getArg('feature-id'),
    runId: getArg('run-id'),
    repo: getArg('repo'),
    specDir: getArg('spec-dir'),
    worktreePath,
    approvalGates,
    resume,
    threadId,
    resumeFromInterrupt,
    push,
    openPr,
    forkAndPr,
    commitSpecs,
    ciWatchEnabled,
    enableEvidence,
    commitEvidence,
    resumePayload,
    agentType,
    mode,
    model,
    resumeReason,
  };
}

/** Simple worker logger — writes to stdout which is redirected to log file by the parent. */
function log(message: string): void {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${getLogPrefix()}[WORKER] ${message}\n`);
}

/** Heartbeat interval (30 seconds) */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Start periodic heartbeat that updates last_heartbeat in the DB.
 * Returns a cleanup function to stop the interval.
 */
function startHeartbeat(runId: string, runRepository: IAgentRunRepository): () => void {
  const interval = setInterval(async () => {
    try {
      const now = new Date();
      await runRepository.updateStatus(runId, AgentRunStatus.running, {
        lastHeartbeat: now,
        updatedAt: now,
      });
    } catch {
      // Heartbeat failure is non-fatal — just log it
      log('Heartbeat update failed (non-fatal)');
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(interval);
}

/**
 * Run the feature agent worker with the given arguments.
 * Initializes DI, creates the graph, and executes it.
 */
export async function runWorker(args: WorkerArgs): Promise<void> {
  // Set log prefix early so all subsequent log lines carry agent/model info
  const agentLabel = args.agentType ?? 'default';
  setLogPrefix(agentLabel, args.model);

  // Log the full reconstructed spawn command for debugging
  const cmdParts = [
    'feature-agent-worker',
    '--feature-id',
    args.featureId,
    '--run-id',
    args.runId,
    '--repo',
    args.repo,
    '--spec-dir',
    args.specDir,
    ...(args.worktreePath ? ['--worktree-path', args.worktreePath] : []),
    ...(args.approvalGates ? ['--approval-gates', JSON.stringify(args.approvalGates)] : []),
    ...(args.resume ? ['--resume'] : []),
    ...(args.threadId ? ['--thread-id', args.threadId] : []),
    ...(args.resumeFromInterrupt ? ['--resume-from-interrupt'] : []),
    ...(args.push ? ['--push'] : []),
    ...(args.openPr ? ['--open-pr'] : []),
    ...(args.forkAndPr ? ['--fork-and-pr'] : []),
    ...(args.commitSpecs === false ? ['--no-commit-specs'] : []),
    ...(args.resumePayload ? ['--resume-payload', args.resumePayload] : []),
    ...(args.agentType ? ['--agent-type', args.agentType] : []),
    ...(args.mode && args.mode !== FeatureMode.Regular ? ['--mode', args.mode] : []),
    ...(args.model ? ['--model', args.model] : []),
  ];
  log(`Starting worker — full command:`);
  log(`  ${cmdParts.join(' ')}`);

  log('Initializing container...');
  await initializeContainer();

  // Initialize settings in the worker process
  log('Loading settings...');
  const initSettingsUseCase = container.resolve(InitializeSettingsUseCase);
  const settings = await initSettingsUseCase.execute();
  initializeSettings(settings);

  const runRepository = container.resolve<IAgentRunRepository>('IAgentRunRepository');
  const executorProvider = container.resolve<IAgentExecutorProvider>('IAgentExecutorProvider');

  // Create executor — use pinned agentType when resuming, otherwise fall back to settings
  let executor;
  if (args.agentType) {
    log(`Creating executor from pinned agent type: ${args.agentType}`);
    const factory = container.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
    executor = factory.createExecutor(args.agentType, settings.agent);
  } else {
    log('Creating executor from configured agent settings...');
    executor = await executorProvider.getExecutor();
  }

  // Resolve merge node dependencies
  const gitPrService = container.resolve<IGitPrService>('IGitPrService');
  const featureRepository = container.resolve<IFeatureRepository>('IFeatureRepository');
  const cleanupFeatureWorktreeUseCase = container.resolve(CleanupFeatureWorktreeUseCase);

  const graphDeps: FeatureAgentGraphDeps = {
    executor,
    mergeNodeDeps: {
      getDiffSummary: (cwd: string, baseBranch: string) =>
        gitPrService.getPrDiffSummary(cwd, baseBranch),
      hasRemote: (cwd: string) => gitPrService.hasRemote(cwd),
      getDefaultBranch: (cwd: string) => gitPrService.getDefaultBranch(cwd),
      verifyMerge: (
        cwd: string,
        featureBranch: string,
        baseBranch: string,
        premergeBaseSha?: string
      ) => gitPrService.verifyMerge(cwd, featureBranch, baseBranch, premergeBaseSha),
      revParse: (cwd: string, ref: string) => gitPrService.revParse(cwd, ref),
      localMergeSquash: (
        cwd: string,
        featureBranch: string,
        baseBranch: string,
        commitMessage: string,
        hasRemote?: boolean
      ) => gitPrService.localMergeSquash(cwd, featureBranch, baseBranch, commitMessage, hasRemote),
      featureRepository,
      gitPrService,
      gitForkService: container.resolve<IGitForkService>('IGitForkService'),
      cleanupFeatureWorktreeUseCase,
    },
  };

  // Use threadId for checkpoint path so resume runs share the same checkpoint DB.
  // Falls back to runId for backwards compatibility with existing runs.
  const checkpointId = args.threadId ?? args.runId;
  const checkpointPath = join(homedir(), '.shep', 'checkpoints', `${checkpointId}.db`);
  log(`Creating checkpointer at ${checkpointPath} (thread: ${checkpointId})`);
  const checkpointer = createCheckpointer(checkpointPath);
  // Both graph factories return compiled graphs with identical FeatureAgentAnnotation
  // state shape and invoke() interface. Cast through unknown because the compiled
  // graphs have different node name types but share the same runtime contract.
  const graph =
    args.mode === FeatureMode.Fast
      ? (createFastFeatureAgentGraph(
          graphDeps as FastFeatureAgentGraphDeps,
          checkpointer
        ) as unknown as ReturnType<typeof createFeatureAgentGraph>)
      : createFeatureAgentGraph(graphDeps, checkpointer);

  // Mark the run as running with our PID
  const now = new Date();
  log(`Updating status to running (PID ${process.pid})...`);
  await runRepository.updateStatus(args.runId, AgentRunStatus.running, {
    pid: process.pid,
    startedAt: now,
    lastHeartbeat: now,
    updatedAt: now,
  });

  // Start heartbeat so the CLI can detect if we're still alive
  const stopHeartbeat = startHeartbeat(args.runId, runRepository);

  // Set heartbeat context so node-helpers can update current node
  setHeartbeatContext(args.runId, runRepository);

  // Set phase timing context so executeNode() records per-phase durations
  const timingRepository = container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
  setPhaseTimingContext(args.runId, timingRepository);

  // Capture repos for SIGTERM handler
  runRepoForSignal = runRepository;
  timingRepoForSignal = timingRepository;

  // Set lifecycle context so nodes update the feature lifecycle as they execute.
  // Route through UpdateFeatureLifecycleUseCase so CheckAndUnblockFeaturesUseCase
  // fires on every transition, automatically unblocking eligible blocked children.
  const updateLifecycleUseCase = container.resolve(UpdateFeatureLifecycleUseCase);
  setLifecycleContext(args.featureId, updateLifecycleUseCase);

  // Record lifecycle event
  await recordLifecycleEvent(args.resume ? 'run:resumed' : 'run:started');

  try {
    const graphConfig = { configurable: { thread_id: checkpointId } };

    let result: Record<string, unknown>;
    if (args.resume && args.resumeFromInterrupt) {
      // Resume from an interrupt (human-in-the-loop approval)
      let resumeValue: unknown = { approved: true }; // default backward-compatible
      if (args.resumePayload) {
        try {
          resumeValue = JSON.parse(args.resumePayload);
          log(`Resuming with typed payload: ${args.resumePayload.slice(0, 200)}`);
        } catch (e) {
          log(`Warning: Failed to parse --resume-payload, using default approval: ${e}`);
        }
      }

      // Derive state updates from the resume payload so executeNode() can
      // read _approvalAction from state instead of from interrupt() return
      // value (fixes the dual-interrupt stale replay bug).
      const stateUpdate: Record<string, unknown> = {};
      if (
        typeof resumeValue === 'object' &&
        resumeValue !== null &&
        'rejected' in resumeValue &&
        (resumeValue as Record<string, unknown>).rejected === true
      ) {
        stateUpdate._approvalAction = 'rejected';
        stateUpdate._rejectionFeedback = (resumeValue as Record<string, unknown>).feedback ?? null;
      } else {
        stateUpdate._approvalAction = 'approved';
        stateUpdate._rejectionFeedback = null;
      }

      log('Resuming graph from interrupt checkpoint...');
      result = await graph.invoke(
        new Command({ resume: resumeValue, update: stateUpdate }),
        graphConfig
      );
    } else if (args.resume) {
      // Resume from error — re-invoke with initial state; LangGraph continues
      // from the last successfully checkpointed node.
      log('Resuming graph from error checkpoint...');
      result = await graph.invoke(
        {
          featureId: args.featureId,
          repositoryPath: args.repo,
          worktreePath: args.worktreePath ?? args.repo,
          specDir: args.specDir,
          error: undefined, // Clear previous error state
          ...(args.approvalGates ? { approvalGates: args.approvalGates } : {}),
          ...(args.model ? { model: args.model } : {}),
          ...(args.resumeReason ? { resumeReason: args.resumeReason } : {}),
          push: args.push ?? false,
          openPr: args.openPr ?? false,
          forkAndPr: args.forkAndPr ?? false,
          commitSpecs: args.commitSpecs ?? true,
          ciWatchEnabled: args.ciWatchEnabled ?? true,
          enableEvidence: args.enableEvidence ?? false,
          commitEvidence: args.commitEvidence ?? false,
        },
        graphConfig
      );
    } else {
      log('Starting graph invocation...');
      result = await graph.invoke(
        {
          featureId: args.featureId,
          repositoryPath: args.repo,
          worktreePath: args.worktreePath ?? args.repo,
          specDir: args.specDir,
          ...(args.approvalGates ? { approvalGates: args.approvalGates } : {}),
          ...(args.model ? { model: args.model } : {}),
          push: args.push ?? false,
          openPr: args.openPr ?? false,
          forkAndPr: args.forkAndPr ?? false,
          commitSpecs: args.commitSpecs ?? true,
          ciWatchEnabled: args.ciWatchEnabled ?? true,
          enableEvidence: args.enableEvidence ?? false,
          commitEvidence: args.commitEvidence ?? false,
        },
        graphConfig
      );
    }
    log(`Graph invocation completed. Error: ${(result.error as string) ?? 'none'}`);

    stopHeartbeat();

    // Check if graph was interrupted (human-in-the-loop approval needed)
    const interruptPayload = result.__interrupt__ as { value: unknown }[] | undefined;
    if (interruptPayload && interruptPayload.length > 0) {
      const now = new Date();
      // Extract the node name from the interrupt payload so the rejection
      // use case can tag feedback with the correct phase (e.g. "merge").
      const interruptValue = interruptPayload[0]?.value as Record<string, unknown> | undefined;
      const interruptNode =
        typeof interruptValue?.node === 'string' ? interruptValue.node : undefined;
      await runRepository.updateStatus(args.runId, AgentRunStatus.waitingApproval, {
        updatedAt: now,
        ...(interruptNode ? { result: `node:${interruptNode}` } : {}),
      });
      log('Run paused — waiting for human approval');
      return;
    }

    // Check if the graph itself reported an error in state
    if (result.error) {
      const failedAt = new Date();
      await runRepository.updateStatus(args.runId, AgentRunStatus.failed, {
        error: result.error as string,
        completedAt: failedAt,
        updatedAt: failedAt,
      });
      await recordLifecycleEvent('run:failed');
      log(`Run marked as failed: ${result.error}`);
      return;
    }

    const completedAt = new Date();
    await runRepository.updateStatus(args.runId, AgentRunStatus.completed, {
      result: (result.messages as string[])?.join('\n') ?? '',
      completedAt,
      updatedAt: completedAt,
    });
    await recordLifecycleEvent('run:completed');
    log('Run marked as completed');
  } catch (error: unknown) {
    stopHeartbeat();
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    log(`Graph invocation error: ${message}`);
    await runRepository.updateStatus(args.runId, AgentRunStatus.failed, {
      error: message,
      completedAt: failedAt,
      updatedAt: failedAt,
    });

    // Reset the feature lifecycle to Started so it doesn't appear stuck
    // in a running phase (e.g., Requirements, Implementation) when the agent has failed.
    try {
      const feature = await featureRepository.findById(args.featureId);
      if (feature && feature.lifecycle !== SdlcLifecycle.Maintain) {
        await featureRepository.update({
          ...feature,
          lifecycle: SdlcLifecycle.Started,
          updatedAt: failedAt,
        });
        log('Feature lifecycle reset to Started');
      }
    } catch (resetErr) {
      log(
        `Failed to reset feature lifecycle: ${resetErr instanceof Error ? resetErr.message : String(resetErr)}`
      );
    }

    await recordLifecycleEvent('run:failed');
    log('Run marked as failed');
  }
}

// Catch unhandled errors globally so they always appear in the log file
process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  log(`UNHANDLED REJECTION: ${msg}`);
  process.exit(1);
});

// Handle IPC disconnect (parent exited) gracefully — this is expected for detached workers
process.on('disconnect', () => {
  log('Parent disconnected (IPC channel closed) — continuing as detached worker');
});

// Handle SIGTERM for graceful shutdown
let runIdForSignal: string | undefined;
let runRepoForSignal: IAgentRunRepository | undefined;
let timingRepoForSignal: IPhaseTimingRepository | undefined;

process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down...');
  if (runIdForSignal && runRepoForSignal) {
    const now = new Date();
    await runRepoForSignal.updateStatus(runIdForSignal, AgentRunStatus.interrupted, {
      error: 'Process received SIGTERM',
      completedAt: now,
      updatedAt: now,
    });
    await recordLifecycleEvent('run:stopped', runIdForSignal, timingRepoForSignal);
  }
  process.exit(0);
});

// Main execution when run as a script
// When using fork(), the forked process runs the entire module, but we want to detect if we're the entrypoint
const isMainModule =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.includes('feature-agent-worker');

if (isMainModule) {
  log('Worker process starting...');
  try {
    const args = parseWorkerArgs(process.argv.slice(2));
    runIdForSignal = args.runId;

    runWorker(args)
      .then(() => {
        runRepoForSignal = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        log('Worker completed successfully, exiting.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Worker fatal error: ${msg}`);
        process.exit(1);
      });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Worker setup error: ${msg}`);
    process.exit(1);
  }
}
