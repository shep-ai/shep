#!/usr/bin/env node
/**
 * Cluster Agent Worker
 *
 * Background worker entry point that runs as a child process via fork().
 * Initializes DI, creates the cluster agent graph, and executes it.
 * Sends periodic heartbeats so the CLI can detect stuck/crashed workers.
 *
 * CLI Args: --cluster-id <id> --run-id <id> [--argocd-enabled] [--argocd-namespace <ns>] [--resume] [--thread-id <id>]
 */

import 'reflect-metadata';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { unlinkSync } from 'node:fs';
import { initializeContainer, container } from '@/infrastructure/di/container.js';
import { createClusterAgentGraph } from './cluster-agent-graph.js';
import type { ClusterAgentDeps } from './cluster-agent-deps.js';
import { createCheckpointer } from '../common/checkpointer.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IK3dService } from '@/application/ports/output/services/k3d-service.interface.js';
import type { IKubectlService } from '@/application/ports/output/services/kubectl-service.interface.js';
import type { IArgoCDService } from '@/application/ports/output/services/argocd-service.interface.js';
import type { IDockerHealthService } from '@/application/ports/output/services/docker-health-service.interface.js';
import { ClusterStatus } from '@/domain/generated/output.js';
import { initializeSettings } from '@/infrastructure/services/settings.service.js';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';

export interface ClusterWorkerArgs {
  clusterId: string;
  runId: string;
  argoCdEnabled: boolean;
  argoCdNamespace: string;
  resume: boolean;
  threadId?: string;
}

/**
 * Parse CLI arguments into a ClusterWorkerArgs object.
 * Throws if any required argument is missing.
 */
export function parseClusterWorkerArgs(args: string[]): ClusterWorkerArgs {
  const getArg = (name: string): string => {
    const index = args.indexOf(`--${name}`);
    if (index === -1 || index + 1 >= args.length) {
      throw new Error(`Missing required argument: --${name}`);
    }
    return args[index + 1];
  };

  const argoCdEnabled = args.includes('--argocd-enabled');
  const resume = args.includes('--resume');

  const nsIdx = args.indexOf('--argocd-namespace');
  const argoCdNamespace = nsIdx !== -1 && nsIdx + 1 < args.length ? args[nsIdx + 1] : 'argocd';

  const threadIdx = args.indexOf('--thread-id');
  const threadId =
    threadIdx !== -1 && threadIdx + 1 < args.length ? args[threadIdx + 1] : undefined;

  return {
    clusterId: getArg('cluster-id'),
    runId: getArg('run-id'),
    argoCdEnabled,
    argoCdNamespace,
    resume,
    threadId,
  };
}

/** Simple worker logger — writes to stdout which is redirected to log file by the parent. */
function log(message: string): void {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] [CLUSTER-WORKER] ${message}\n`);
}

/** Heartbeat interval (30 seconds) */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Start periodic heartbeat that updates the cluster's lastHealthCheckAt timestamp.
 * Returns a cleanup function to stop the interval.
 */
function startHeartbeat(clusterId: string, clusterRepo: IClusterRepository): () => void {
  const interval = setInterval(async () => {
    try {
      await clusterRepo.update(clusterId, {
        lastHealthCheckAt: new Date(),
      });
    } catch {
      log('Heartbeat update failed (non-fatal)');
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(interval);
}

/**
 * Run the cluster agent worker with the given arguments.
 * Initializes DI, creates the graph, and executes it.
 */
export async function runClusterWorker(args: ClusterWorkerArgs): Promise<void> {
  log(`Starting worker for cluster ${args.clusterId} (run ${args.runId})`);
  log(`  argoCdEnabled: ${args.argoCdEnabled}`);
  log(`  argoCdNamespace: ${args.argoCdNamespace}`);
  log(`  resume: ${args.resume}`);

  log('Initializing container...');
  await initializeContainer();

  // Initialize settings in the worker process
  log('Loading settings...');
  const initSettingsUseCase = container.resolve(InitializeSettingsUseCase);
  const settings = await initSettingsUseCase.execute();
  initializeSettings(settings);

  // Resolve infrastructure service dependencies
  const clusterRepo = container.resolve<IClusterRepository>('IClusterRepository');
  const k3dService = container.resolve<IK3dService>('IK3dService');
  const kubectlService = container.resolve<IKubectlService>('IKubectlService');
  const argoCdService = container.resolve<IArgoCDService>('IArgoCDService');
  const dockerHealthService = container.resolve<IDockerHealthService>('IDockerHealthService');

  // Look up the cluster to get its name/slug for k3d operations
  const cluster = await clusterRepo.findById(args.clusterId);
  if (!cluster) {
    log(`Cluster not found: ${args.clusterId}`);
    throw new Error(`Cluster not found: ${args.clusterId}`);
  }

  const graphDeps: ClusterAgentDeps = {
    k3dService,
    kubectlService,
    argoCdService,
    dockerHealthService,
    clusterRepo,
  };

  // Use threadId for checkpoint path so resume runs share the same checkpoint DB.
  const checkpointId = args.threadId ?? args.runId;
  const checkpointPath = join(homedir(), '.shep', 'checkpoints', `cluster-${checkpointId}.db`);
  log(`Creating checkpointer at ${checkpointPath} (thread: ${checkpointId})`);

  // Start heartbeat
  const stopHeartbeat = startHeartbeat(args.clusterId, clusterRepo);

  // Save references for SIGTERM handler
  clusterIdForSignal = args.clusterId;
  clusterRepoForSignal = clusterRepo;

  try {
    const graphConfig = { configurable: { thread_id: checkpointId } };

    const initialInput = {
      clusterId: args.clusterId,
      clusterName: cluster.slug,
      status: ClusterStatus.Provisioning,
      argoCdEnabled: args.argoCdEnabled,
      argoCdNamespace: args.argoCdNamespace,
    };

    let result: Record<string, unknown>;

    if (args.resume) {
      // Resume from error — delete stale checkpoint and re-invoke fresh.
      // Completed phases in DB ensure already-done work is not repeated.
      log('Deleting stale checkpoint for fresh resume...');
      try {
        unlinkSync(checkpointPath);
        log('Checkpoint deleted successfully');
      } catch {
        log('No checkpoint to delete (first run or already cleaned)');
      }

      const freshCheckpointer = createCheckpointer(checkpointPath);
      const freshGraph = createClusterAgentGraph(graphDeps, freshCheckpointer);

      log('Resuming graph with fresh checkpoint...');
      result = await freshGraph.invoke({ ...initialInput, error: undefined }, graphConfig);
    } else {
      // First run
      const checkpointer = createCheckpointer(checkpointPath);
      const graph = createClusterAgentGraph(graphDeps, checkpointer);

      log('Starting graph invocation...');
      result = await graph.invoke(initialInput, graphConfig);
    }

    stopHeartbeat();

    // Check the result for error state
    if (result.error) {
      log(`Graph completed with error: ${result.error}`);
      // The error node already updated DB status — just log and exit
    } else {
      log('Graph completed successfully — cluster is ready');
    }
  } catch (error: unknown) {
    stopHeartbeat();
    const message = error instanceof Error ? error.message : String(error);
    log(`Graph invocation error: ${message}`);

    // Update cluster status to Error
    try {
      await clusterRepo.update(args.clusterId, {
        status: ClusterStatus.Error,
        errorMessage: message,
      });
    } catch (updateErr) {
      log(
        `Failed to update cluster status to Error: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`
      );
    }
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
let clusterIdForSignal: string | undefined;
let clusterRepoForSignal: IClusterRepository | undefined;

process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down...');
  if (clusterIdForSignal && clusterRepoForSignal) {
    try {
      await clusterRepoForSignal.update(clusterIdForSignal, {
        status: ClusterStatus.Error,
        errorMessage: 'Worker process received SIGTERM',
      });
    } catch {
      log('Failed to update cluster status on SIGTERM');
    }
  }
  process.exit(0);
});

// Main execution when run as a script
const isMainModule =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.includes('cluster-agent-worker');

if (isMainModule) {
  log('Worker process starting...');
  try {
    const args = parseClusterWorkerArgs(process.argv.slice(2));

    runClusterWorker(args)
      .then(() => {
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
