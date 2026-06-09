/**
 * Feature Agent Process Service
 *
 * Infrastructure implementation of IFeatureAgentProcessService.
 * Manages background worker processes for feature agent execution
 * using Node.js child_process.fork().
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { openSync } from 'node:fs';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import {
  AgentRunStatus,
  type ApprovalGates,
  type AgentType,
  type SecurityMode,
  type SecurityActionCategory,
  type SecurityActionDisposition,
} from '@/domain/generated/output.js';
import { IS_WINDOWS } from '../../../platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Terminal statuses that should not be updated */
const TERMINAL_STATUSES = new Set<AgentRunStatus>([
  AgentRunStatus.completed,
  AgentRunStatus.failed,
  AgentRunStatus.interrupted,
  AgentRunStatus.cancelled,
]);

export class FeatureAgentProcessService implements IFeatureAgentProcessService {
  constructor(private readonly runRepository: IAgentRunRepository) {}

  spawn(
    featureId: string,
    runId: string,
    repoPath: string,
    specDir: string,
    worktreePath?: string,
    options?: {
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
      fast?: boolean;
      model?: string;
      resumeReason?: string;
      securityMode?: SecurityMode;
      securityActionDispositions?: Partial<
        Record<SecurityActionCategory, SecurityActionDisposition>
      >;
    }
  ): number {
    const workerPath = join(__dirname, 'feature-agent-worker.js');

    const args = [
      '--feature-id',
      featureId,
      '--run-id',
      runId,
      '--repo',
      repoPath,
      '--spec-dir',
      specDir,
    ];
    if (worktreePath) {
      args.push('--worktree-path', worktreePath);
    }
    if (options?.approvalGates) {
      args.push('--approval-gates', JSON.stringify(options.approvalGates));
    }
    if (options?.threadId) {
      args.push('--thread-id', options.threadId);
    }
    if (options?.resume) {
      args.push('--resume');
    }
    if (options?.resumeFromInterrupt) {
      args.push('--resume-from-interrupt');
    }
    if (options?.push) {
      args.push('--push');
    }
    if (options?.openPr) {
      args.push('--open-pr');
    }
    if (options?.forkAndPr) {
      args.push('--fork-and-pr');
    }
    if (options?.commitSpecs === false) {
      args.push('--no-commit-specs');
    }
    if (options?.ciWatchEnabled === false) {
      args.push('--no-ci-watch');
    }
    if (options?.enableEvidence) {
      args.push('--enable-evidence');
    }
    if (options?.commitEvidence) {
      args.push('--commit-evidence');
    }
    if (options?.resumePayload) {
      args.push('--resume-payload', options.resumePayload);
    }
    if (options?.agentType) {
      args.push('--agent-type', options.agentType);
    }
    if (options?.fast) {
      args.push('--fast');
    }
    if (options?.model) {
      args.push('--model', options.model);
    }
    if (options?.resumeReason) {
      args.push('--resume-reason', options.resumeReason);
    }
    if (options?.securityMode) {
      args.push('--security-mode', options.securityMode);
    }
    if (options?.securityActionDispositions) {
      args.push('--security-dispositions', JSON.stringify(options.securityActionDispositions));
    }
    // Create log file for worker output (for debugging)
    const logsDir = join(homedir(), '.shep', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `worker-${runId}.log`);
    const logFd = openSync(logPath, 'a');

    const child = fork(workerPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      ...(IS_WINDOWS ? { windowsHide: true } : {}),
    });

    if (!child.pid) {
      throw new Error('Failed to spawn feature agent worker: no PID returned');
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

  async checkAndMarkCrashed(runId: string): Promise<void> {
    const run = await this.runRepository.findById(runId);
    if (!run || !run.pid || TERMINAL_STATUSES.has(run.status)) {
      return;
    }

    if (!this.isAlive(run.pid)) {
      const now = new Date().toISOString();
      await this.runRepository.updateStatus(runId, AgentRunStatus.interrupted, {
        error: `Agent process (PID ${run.pid}) crashed or was killed`,
        completedAt: now,
        updatedAt: now,
      });
    }
  }
}
