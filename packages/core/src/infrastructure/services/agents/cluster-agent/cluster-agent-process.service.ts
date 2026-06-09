/**
 * Cluster Agent Process Service
 *
 * Infrastructure implementation of IClusterAgentProcessService.
 * Manages background worker processes for cluster agent execution
 * using Node.js child_process.fork().
 *
 * Follows the FeatureAgentProcessService pattern exactly.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  IClusterAgentProcessService,
  ClusterAgentSpawnOptions,
} from '../../../../application/ports/output/services/cluster-agent-process-service.interface.js';
import { IS_WINDOWS } from '../../../platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ClusterAgentProcessService implements IClusterAgentProcessService {
  spawn(clusterId: string, runId: string, options?: ClusterAgentSpawnOptions): number {
    const workerPath = join(__dirname, 'cluster-agent-worker.js');

    const args = ['--cluster-id', clusterId, '--run-id', runId];

    if (options?.argoCdEnabled) {
      args.push('--argocd-enabled');
    }
    if (options?.argoCdNamespace) {
      args.push('--argocd-namespace', options.argoCdNamespace);
    }
    if (options?.resume) {
      args.push('--resume');
    }
    if (options?.threadId) {
      args.push('--thread-id', options.threadId);
    }

    // Create log file for worker output
    const logsDir = join(homedir(), '.shep', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `cluster-worker-${runId}.log`);
    const logFd = openSync(logPath, 'a');

    const child = fork(workerPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      ...(IS_WINDOWS ? { windowsHide: true } : {}),
    });

    if (!child.pid) {
      throw new Error('Failed to spawn cluster agent worker: no PID returned');
    }

    // Disconnect IPC so parent can exit cleanly without breaking the child
    child.disconnect();
    child.unref();
    return child.pid;
  }

  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  kill(pid: number): void {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }
}
