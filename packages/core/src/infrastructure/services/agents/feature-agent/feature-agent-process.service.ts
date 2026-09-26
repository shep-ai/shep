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
import { mkdirSync, chmodSync } from 'node:fs';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import {
  AgentRunStatus,
  type ApprovalGates,
  type AgentEffort,
  type AgentType,
  type SecurityMode,
  type SecurityActionCategory,
  type SecurityActionDisposition,
} from '@/domain/generated/output.js';
import { crashedWorkerMessage } from '@/domain/shared/agent-run-liveness.js';
import {
  NON_TERMINAL_AGENT_RUN_STATUSES,
  TERMINAL_AGENT_RUN_STATUSES,
} from '@/domain/shared/agent-run-status.js';
import { agentRunEnvironment } from '@/domain/shared/agent-run-environment.js';
import { IS_WINDOWS } from '../../../platform.js';
import { LOG_LEVEL_ENV_VAR } from '../../logging/log-level.js';
import { getShepHomeDir } from '../../filesystem/shep-directory.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      exploration?: boolean;
      model?: string;
      effort?: AgentEffort;
      resumeReason?: string;
      securityMode?: SecurityMode;
      securityActionDispositions?: Partial<
        Record<SecurityActionCategory, SecurityActionDisposition>
      >;
      /** Overrides the parent's SHEP_LOG_LEVEL for this worker only. */
      logLevel?: string;
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
    if (options?.exploration) {
      args.push('--explore');
    }
    if (options?.model) {
      args.push('--model', options.model);
    }
    if (options?.effort) {
      args.push('--effort', options.effort);
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
    // Two bugs lived on these two lines: the directory was created with the
    // default mode (0777 & ~umask, so world-readable — and worker logs carry
    // every tool call's full input, including tokenised git remote URLs), and
    // `homedir()` bypassed getShepHomeDir(), so SHEP_HOME was ignored and test
    // runs wrote into the user's real ~/.shep.
    const logsDir = join(getShepHomeDir(), 'logs');
    mkdirSync(logsDir, { recursive: true, ...(IS_WINDOWS ? {} : { mode: 0o700 }) });
    // mkdirSync applies `mode` only when it CREATES the directory, so an
    // install that already has a permissive ~/.shep/logs would never be
    // repaired. chmod every time; a volume that refuses chmod must not stop a
    // run from starting.
    if (!IS_WINDOWS) {
      try {
        chmodSync(logsDir, 0o700);
      } catch {
        /* read-only or unsupported filesystem — not worth failing the run */
      }
    }
    const logPath = join(logsDir, `worker-${runId}.log`);
    const logFd = openSync(logPath, 'a', IS_WINDOWS ? undefined : 0o600);

    const child = fork(workerPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      // Passed explicitly rather than inherited. A worker spawned by the
      // long-lived daemon would otherwise carry whatever log level the daemon
      // started with, so raising verbosity from a later terminal never reached
      // the executors.
      //
      // The run marker is inherited by every agent CLI the worker spawns, so a
      // `shep stop` / `shep agent stop` an agent runs knows it would be
      // stopping itself and refuses (domain/shared/agent-run-environment.ts).
      env: {
        ...process.env,
        ...(options?.logLevel ? { [LOG_LEVEL_ENV_VAR]: options.logLevel } : {}),
        ...agentRunEnvironment(runId, featureId),
      },
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

  /**
   * Mark a run as interrupted when the process behind it is gone.
   *
   * The read below is only an early exit. The decision it feeds — "this run is
   * not finished, and its process is dead" — is made from a snapshot, and the
   * worker's NORMAL exit lands inside that snapshot's lifetime: it writes
   * `completed` and exits, so `isAlive()` says "dead" about a run that just
   * succeeded. The status guard on the write is what stops that from being
   * reported to the user as a crash, with completedAt and error clobbered.
   *
   * @param runId - The agent run to check
   */
  async checkAndMarkCrashed(runId: string): Promise<void> {
    const run = await this.runRepository.findById(runId);
    if (!run?.pid || TERMINAL_AGENT_RUN_STATUSES.has(run.status)) {
      return;
    }

    if (!this.isAlive(run.pid)) {
      const now = new Date().toISOString();
      await this.runRepository.updateStatus(
        runId,
        AgentRunStatus.interrupted,
        {
          error: crashedWorkerMessage(run.pid),
          completedAt: now,
          updatedAt: now,
        },
        { allowedFrom: NON_TERMINAL_AGENT_RUN_STATUSES }
      );
    }
  }
}
