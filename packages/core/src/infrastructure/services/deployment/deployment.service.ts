/**
 * Deployment Service
 *
 * Infrastructure service that manages local dev server deployments.
 * Holds an in-memory Map of active deployments keyed by targetId AND
 * persists deployment records to the `dev_servers` SQLite table so that
 * running dev servers survive page reloads and server restarts.
 *
 * On startup, call `recoverAll()` to reconcile the DB with actual
 * process state (clean up dead PIDs, re-adopt live ones).
 *
 * Composed from focused modules in this directory:
 * - deployment-service-deps.ts    — injectable process primitives (spawn/kill/…)
 * - deployment-entry.ts           — registry entry + transient-state helpers
 * - deployment-db-store.ts        — dev_servers persistence
 * - deployment-spawner.ts         — run-plan / detection spawn paths
 * - deployment-output-listener.ts — line buffering + port detection
 * - deployment-status.ts          — getStatus/listAll reads with liveness cleanup
 * - deployment-stop.ts            — graceful stop (SIGTERM → poll → SIGKILL)
 * - deployment-recovery.ts        — startup reconciliation and zombie handling
 */

import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import { DeploymentState } from '@/domain/generated/output.js';
import type {
  IDeploymentService,
  DeploymentStatus,
  DeploymentStatusEntry,
  LogEntry,
  StartOptions,
} from '@/application/ports/output/services/deployment-service.interface.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { LogRingBuffer } from './log-ring-buffer.js';
import {
  defaultDeploymentServiceDeps,
  type DeploymentServiceDeps,
} from './deployment-service-deps.js';
import { isTransientEntry, TRANSIENT_PID, type DeploymentEntry } from './deployment-entry.js';
import { DeploymentDbStore } from './deployment-db-store.js';
import type { DeploymentContext } from './deployment-context.js';
import {
  attachOutputListener,
  logBootCrashOutput,
  type OutputListenerHooks,
} from './deployment-output-listener.js';
import { DeploymentRecovery } from './deployment-recovery.js';
import { spawnFromDetection, spawnFromRunPlan } from './deployment-spawner.js';
import { getDeploymentStatus, listAllDeployments } from './deployment-status.js';
import { stopDeployment } from './deployment-stop.js';

export type { DeploymentServiceDeps } from './deployment-service-deps.js';

const log = createDeploymentLogger('[DeploymentService]');
const DEFAULT_TARGET_TYPE = 'repository';

export class DeploymentService implements IDeploymentService {
  private readonly deployments = new Map<string, DeploymentEntry>();
  /**
   * Post-mortem log buffers for targets whose entry is gone (crashed
   * process or failed dev-server-agent run). Served by getLogs()/appendLog()
   * so a run's failure trail stays inspectable AND streamable (SSE) after
   * the process died — without this, the agent graph's verify/remediate
   * lines and terminal failureReason vanish exactly when they matter.
   * Cleared when a new lifecycle begins (start/setTransientState), on
   * explicit stop of a live entry, and on stopAll.
   */
  private readonly retainedLogs = new Map<string, LogRingBuffer>();
  private readonly deps: DeploymentServiceDeps;
  private readonly emitter = new EventEmitter();
  private readonly dbStore = new DeploymentDbStore();
  private readonly ctx: DeploymentContext;
  private readonly recovery: DeploymentRecovery;
  private readonly outputHooks: OutputListenerHooks;

  constructor(deps: Partial<DeploymentServiceDeps> = {}) {
    this.deps = { ...defaultDeploymentServiceDeps, ...deps };
    this.ctx = {
      deployments: this.deployments,
      dbStore: this.dbStore,
      isAlive: (pid) => this.deps.isAlive(pid),
      kill: (pid, signal) => this.deps.kill(pid, signal),
    };
    this.recovery = new DeploymentRecovery({
      ...this.ctx,
      start: (targetId, targetPath, targetType) => this.start(targetId, targetPath, targetType),
    });
    this.outputHooks = {
      emitLog: (logEntry) => this.emitter.emit('log', logEntry),
      onReady: (entry) => this.dbStore.upsert(entry),
    };
  }

  /**
   * Inject the database connection. Called from DI container after DB is ready.
   */
  setDatabase(db: Database.Database): void {
    this.dbStore.setDatabase(db);
  }

  /**
   * Recover dev servers from the database on startup.
   * See DeploymentRecovery for the per-row strategies.
   */
  recoverAll(): void {
    this.recovery.recoverAll();
  }

  /**
   * Start a deployment for the given target.
   * If a deployment already exists for this target, it is stopped first
   * (transient Analyzing/Installing entries are simply replaced — there is
   * no process to kill).
   *
   * With `options.runPlan` the given command is spawned verbatim in the
   * given cwd and dev-script detection is skipped entirely. start() never
   * installs dependencies — installation is the dev-server-agent graph's job.
   */
  start(
    targetId: string,
    targetPath: string,
    targetType = DEFAULT_TARGET_TYPE,
    options?: StartOptions
  ): void {
    log.info(`start() called — targetId="${targetId}", targetPath="${targetPath}"`);

    this.removeExisting(targetId);
    // A fresh spawn starts a fresh visible log trail.
    this.retainedLogs.delete(targetId);

    const child = options?.runPlan
      ? spawnFromRunPlan(this.deps, options.runPlan)
      : spawnFromDetection(this.deps, targetPath);

    if (!child.pid) {
      log.error('spawn() returned no PID — process failed to start');
      throw new Error('Failed to spawn dev server: no PID returned');
    }

    log.info(`Process spawned — pid=${child.pid}`);

    const entry: DeploymentEntry = {
      pid: child.pid,
      child,
      state: DeploymentState.Booting,
      url: null,
      targetId,
      targetPath,
      targetType,
      stdoutBuffer: '',
      stderrBuffer: '',
      logs: new LogRingBuffer(),
    };

    this.deployments.set(targetId, entry);
    // NOTE: Do NOT write to DB during Booting. The spawned process may be
    // another shep instance sharing ~/.shep/data — its recoverAll() would
    // find this Booting entry, see its own PID as alive, and SIGKILL itself.
    // We persist to DB only when the state transitions to Ready (URL detected).

    // Attach stdout/stderr listeners for port detection
    attachOutputListener(entry, 'stdout', this.outputHooks);
    attachOutputListener(entry, 'stderr', this.outputHooks);

    // Handle spawn errors (command not found, permission denied, etc.)
    child.on('error', (err) => {
      log.error(`Child process error for "${targetId}" (pid=${entry.pid}): ${err.message}`);
      entry.state = DeploymentState.Stopped;
      this.retainEntryLogs(entry);
      this.deployments.delete(targetId);
      this.dbStore.delete(targetId);
    });

    // Use 'close' instead of 'exit' — 'close' fires after stdio streams are
    // fully consumed, so entry.logs will contain all captured output.
    child.on('close', (code, signal) => {
      this.handleClose(entry, code, signal);
    });
  }

  /**
   * Surface an externally-driven pre-spawn state (Analyzing / Installing).
   *
   * The entry is in-memory ONLY (pid 0, no child process) and is NEVER
   * persisted to dev_servers — same rationale as Booting. Any existing live
   * deployment for the target is stopped first (the graph owns the lifecycle
   * from here); an existing transient entry is simply replaced, keeping its
   * accumulated logs.
   */
  setTransientState(
    targetId: string,
    targetPath: string,
    targetType: string,
    state: DeploymentState.Analyzing | DeploymentState.Installing
  ): void {
    const existing = this.deployments.get(targetId);
    // Continuity: adopt the previous transient buffer, or the retained
    // post-mortem buffer of a just-crashed attempt (mid-run remediation
    // loops keep one uninterrupted trail).
    const previousLogs =
      existing && isTransientEntry(existing)
        ? existing.logs
        : (this.retainedLogs.get(targetId) ?? null);
    this.retainedLogs.delete(targetId);
    this.removeExisting(targetId);

    const entry: DeploymentEntry = {
      pid: TRANSIENT_PID,
      child: null,
      state,
      url: null,
      targetId,
      targetPath,
      targetType,
      stdoutBuffer: '',
      stderrBuffer: '',
      logs: previousLogs ?? new LogRingBuffer(),
    };
    this.deployments.set(targetId, entry);
    log.info(`setTransientState("${targetId}") — state=${state}, targetPath="${targetPath}"`);
  }

  /**
   * Get the current deployment status for a target.
   * Checks in-memory Map first, then falls back to DB for recovered deployments.
   * Validates PID liveness — cleans up if dead.
   */
  getStatus(targetId: string): DeploymentStatus | null {
    return getDeploymentStatus(this.ctx, targetId);
  }

  /**
   * List all tracked deployments with live processes (plus transient
   * pre-spawn entries, which have no process by design).
   *
   * Merges in-memory entries with any DB rows not yet re-adopted. Any
   * dead processes encountered are cleaned up (both in-memory and DB).
   */
  listAll(): DeploymentStatusEntry[] {
    return listAllDeployments(this.ctx);
  }

  /**
   * Stop a deployment gracefully: SIGTERM → poll → SIGKILL.
   * Transient (pre-spawn) entries are simply removed — no process to kill —
   * but their log trail is RETAINED as a post-mortem (the dev-server-agent
   * graph stops failed runs this way; the failure reason must stay
   * inspectable). Stopping a live entry dismisses any retained trail.
   */
  async stop(targetId: string): Promise<void> {
    const entry = this.deployments.get(targetId);
    if (entry) {
      if (isTransientEntry(entry)) {
        this.retainedLogs.set(targetId, entry.logs);
      } else {
        entry.suppressLogRetention = true;
        this.retainedLogs.delete(targetId);
      }
    }
    await stopDeployment(this.ctx, targetId);
  }

  /**
   * Force-stop all tracked deployments immediately (for daemon shutdown).
   */
  stopAll(): void {
    for (const [targetId, entry] of this.deployments) {
      entry.logs.clear();
      if (isTransientEntry(entry)) {
        // No process behind transient entries — just drop them.
        this.deployments.delete(targetId);
        continue;
      }
      entry.suppressLogRetention = true;
      this.killProcess(entry);
    }
    this.retainedLogs.clear();
    // Also clean DB
    this.dbStore.deleteAll();
  }

  /**
   * Append a synthetic log line to the target's buffer (transient or live
   * entry alike — falling back to the retained post-mortem buffer when the
   * entry is already gone) and emit it on the 'log' event for live SSE
   * streaming. No-op when the target has neither an entry nor a retained
   * trail (never-tracked targets).
   */
  appendLog(targetId: string, line: string): void {
    const entry = this.deployments.get(targetId);
    const logs = entry?.logs ?? this.retainedLogs.get(targetId);
    if (!logs) return;

    const logEntry: LogEntry = {
      targetId,
      stream: 'stdout',
      line,
      timestamp: Date.now(),
    };
    logs.push(logEntry);
    this.emitter.emit('log', logEntry);
  }

  /**
   * Get the accumulated log buffer for a deployment. After a spontaneous
   * exit or a failed dev-server-agent run the retained post-mortem trail is
   * served until a new lifecycle for the target begins.
   */
  getLogs(targetId: string): LogEntry[] | null {
    const entry = this.deployments.get(targetId);
    if (entry) return entry.logs.getAll();
    return this.retainedLogs.get(targetId)?.getAll() ?? null;
  }

  /**
   * Subscribe to real-time log events.
   */
  on(event: 'log', handler: (entry: LogEntry) => void): void {
    this.emitter.on(event, handler);
  }

  /**
   * Unsubscribe from real-time log events.
   */
  off(event: 'log', handler: (entry: LogEntry) => void): void {
    this.emitter.off(event, handler);
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  /**
   * Remove any tracked deployment for the target before (re)starting it.
   * Transient entries are just dropped (no process); live entries are
   * SIGKILLed and their DB row removed.
   */
  private removeExisting(targetId: string): void {
    const existing = this.deployments.get(targetId);
    if (!existing) return;

    if (isTransientEntry(existing)) {
      log.info(`Replacing transient ${existing.state} entry for "${targetId}"`);
      this.deployments.delete(targetId);
      return;
    }

    log.info(`Stopping existing deployment for "${targetId}" (pid=${existing.pid})`);
    // Intentional replacement — the new lifecycle owns the log trail.
    existing.suppressLogRetention = true;
    this.killProcess(existing);
    this.deployments.delete(targetId);
    this.dbStore.delete(targetId);
  }

  /** Handle a spawned child's 'close' event — log crash output, clean up. */
  private handleClose(
    entry: DeploymentEntry,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const wasBooting = entry.state === DeploymentState.Booting;
    log.info(
      `Process closed for "${entry.targetId}" (pid=${entry.pid}) — code=${code}, signal=${signal}, wasBooting=${wasBooting}`
    );
    if (wasBooting) {
      logBootCrashOutput(entry, code, signal);
    }
    this.retainEntryLogs(entry);
    this.deployments.delete(entry.targetId);
    this.dbStore.delete(entry.targetId);
  }

  /**
   * Retain a departing entry's log buffer as the target's post-mortem
   * trail — unless the teardown was intentional (stop/stopAll/replacement
   * set suppressLogRetention before killing).
   */
  private retainEntryLogs(entry: DeploymentEntry): void {
    if (entry.suppressLogRetention) return;
    this.retainedLogs.set(entry.targetId, entry.logs);
  }

  private killProcess(entry: DeploymentEntry): void {
    try {
      this.deps.kill(entry.pid, 'SIGKILL');
    } catch {
      // Process may already be dead
    }
  }
}
