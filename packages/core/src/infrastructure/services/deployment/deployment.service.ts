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
 */

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
// On Unix we use process.kill(-pid) to send signals to the process GROUP
// (detached: true puts the child in its own group via setsid()).
// On Windows, negative PIDs are not supported — use taskkill /T for tree kill.
import { DeploymentState } from '@/domain/generated/output.js';
import type {
  IDeploymentService,
  DeploymentStatus,
  DeploymentStatusEntry,
  LogEntry,
} from '@/application/ports/output/services/deployment-service.interface.js';
import { detectDevScript } from './detect-dev-script.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { parsePort } from './parse-port.js';
import { LogRingBuffer } from './log-ring-buffer.js';
import { IS_WINDOWS } from '../../platform.js';

const log = createDeploymentLogger('[DeploymentService]');
const POLL_INTERVAL_MS = 200;
const MAX_WAIT_MS = 5000;

interface DeploymentEntry {
  pid: number;
  child: ChildProcess | null; // null for recovered (orphan) processes
  state: DeploymentState;
  url: string | null;
  targetId: string;
  targetPath: string;
  targetType: string;
  stdoutBuffer: string;
  stderrBuffer: string;
  logs: LogRingBuffer;
}

interface DevServerRow {
  target_id: string;
  target_type: string;
  pid: number;
  state: string;
  url: string | null;
  target_path: string;
  started_at: number;
}

export interface DeploymentServiceDeps {
  spawn: typeof spawn;
  detectDevScript: typeof detectDevScript;
  kill: (pid: number, signal: NodeJS.Signals | string) => void;
  isAlive: (pid: number) => boolean;
}

const defaultDeps: DeploymentServiceDeps = {
  spawn,
  detectDevScript,
  kill: (pid, signal) => {
    if (IS_WINDOWS) {
      // On Windows, negative PIDs are not supported. Use taskkill /T to
      // kill the entire process tree (shell + child dev server).
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        // Process already dead
      }
      return;
    }
    try {
      // Kill the entire process group (negative PID) — safe because
      // detached: true puts the child in its own group via setsid().
      process.kill(-pid, signal as NodeJS.Signals);
    } catch {
      // Fallback: kill just the process itself
      try {
        process.kill(pid, signal as NodeJS.Signals);
      } catch {
        // Process already dead
      }
    }
  },
  isAlive: (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};

export class DeploymentService implements IDeploymentService {
  private readonly deployments = new Map<string, DeploymentEntry>();
  private readonly deps: DeploymentServiceDeps;
  private readonly emitter = new EventEmitter();
  private db: Database.Database | null = null;

  constructor(deps: Partial<DeploymentServiceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * Inject the database connection. Called from DI container after DB is ready.
   */
  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  /**
   * Recover dev servers from the database on startup.
   *
   * Three recovery strategies based on process state:
   * 1. Alive + Ready (has URL) → re-adopt, then validate URL asynchronously
   * 2. Alive + Booting (no URL) → kill orphan and re-spawn (can't re-attach stdout)
   * 3. Dead → re-spawn if target directory still exists
   *
   * After sync recovery, fires off async URL health checks for re-adopted
   * processes. Zombies (alive but not serving) are killed and re-spawned.
   *
   * All re-spawns are wrapped in try/catch so one failure doesn't block others.
   */
  recoverAll(): void {
    if (!this.db) return;

    // Child dev servers spawned by DeploymentService share the same global DB.
    // Skip recovery to avoid killing processes owned by the parent instance.
    if (process.env.SHEP_SKIP_RECOVERY) {
      log.info('SHEP_SKIP_RECOVERY set — skipping dev server recovery');
      return;
    }

    let rows: DevServerRow[];
    try {
      const stmt = this.db.prepare('SELECT * FROM dev_servers');
      rows = (stmt.all() as DevServerRow[]) ?? [];
    } catch {
      log.info('dev_servers table not ready — skipping recovery');
      return;
    }

    if (!rows || rows.length === 0) {
      log.info('No dev servers to recover from database');
      return;
    }

    log.info(`Recovering ${rows.length} dev server(s) from database`);

    for (const row of rows) {
      const alive = this.deps.isAlive(row.pid);
      const hasUrl = row.state === DeploymentState.Ready && row.url;

      if (alive && hasUrl) {
        // Strategy 1: Process alive and Ready — re-adopt, then validate URL async
        log.info(
          `Recovered "${row.target_id}" (pid=${row.pid}, state=${row.state}, url=${row.url})`
        );
        const entry: DeploymentEntry = {
          pid: row.pid,
          child: null, // orphan — we don't have the ChildProcess handle
          state: row.state as DeploymentState,
          url: row.url,
          targetId: row.target_id,
          targetPath: row.target_path,
          targetType: row.target_type,
          stdoutBuffer: '',
          stderrBuffer: '',
          logs: new LogRingBuffer(),
        };
        this.deployments.set(row.target_id, entry);
        // Fire-and-forget: validate URL is actually responding, kill zombie if not
        this.validateAndRespawn(entry);
        continue;
      }

      if (alive) {
        // Strategy 2: Process alive but stuck in Booting — leave it running.
        // We can't re-attach stdout so we can't detect when it becomes Ready,
        // but killing it would be destructive (another process on the same
        // shared DB may have just spawned it). The user can restart manually.
        log.info(
          `Orphan "${row.target_id}" (pid=${row.pid}) stuck in ${row.state} — leaving alive (cannot re-attach)`
        );
        this.dbDelete(row.target_id);
        continue;
      }

      // Strategy 3: Dead process — re-spawn if target directory still exists
      log.info(`Dev server "${row.target_id}" (pid=${row.pid}) is dead — will re-spawn`);
      this.dbDelete(row.target_id);

      if (!existsSync(join(row.target_path, 'package.json'))) {
        log.warn(
          `Skipping re-spawn for "${row.target_id}" — no package.json at "${row.target_path}"`
        );
        continue;
      }

      try {
        log.info(`Re-spawning dev server for "${row.target_id}" at "${row.target_path}"`);
        this.start(row.target_id, row.target_path, row.target_type);
      } catch (err) {
        log.error(`Failed to re-spawn "${row.target_id}": ${err}`);
      }
    }
  }

  /**
   * Start a deployment for the given target.
   * If a deployment already exists for this target, it is stopped first.
   */
  start(targetId: string, targetPath: string, targetType = 'repository'): void {
    log.info(`start() called — targetId="${targetId}", targetPath="${targetPath}"`);

    // Stop any existing deployment for this target
    const existing = this.deployments.get(targetId);
    if (existing) {
      log.info(`Stopping existing deployment for "${targetId}" (pid=${existing.pid})`);
      this.killProcess(existing);
      this.deployments.delete(targetId);
      this.dbDelete(targetId);
    }

    // Detect the dev script
    const detection = this.deps.detectDevScript(targetPath);
    if (!detection.success) {
      log.error(`Dev script detection failed: ${detection.error}`);
      throw new Error(detection.error);
    }

    // Build spawn args based on package manager
    const { packageManager, scriptName, command, needsInstall, resolvedDir } = detection;
    const spawnDir = resolvedDir;
    const args = packageManager === 'npm' ? ['run', scriptName] : [scriptName];

    // Install dependencies if node_modules is missing (e.g. fresh worktree)
    if (needsInstall) {
      log.info(`node_modules missing in "${spawnDir}" — running ${packageManager} install`);
      try {
        execFileSync(packageManager, ['install'], {
          cwd: spawnDir,
          shell: true,
          stdio: 'ignore',
          ...(IS_WINDOWS ? { windowsHide: true } : {}),
        });
        log.info('Dependencies installed successfully');
      } catch (err) {
        log.error(`Dependency install failed: ${err}`);
        throw new Error(`Failed to install dependencies: ${err}`);
      }
    }

    log.info(
      `Spawning dev server: command="${command}", packageManager="${packageManager}", scriptName="${scriptName}", cwd="${spawnDir}"`
    );

    const child = this.deps.spawn(packageManager, args, {
      shell: true,
      cwd: spawnDir,
      // On Unix, detached: true creates a process group via setsid() so we can
      // kill the entire tree with process.kill(-pid). On Windows this flag causes
      // CREATE_NEW_CONSOLE which opens a visible terminal window and disconnects
      // stdout/stderr — we don't need it because taskkill /F /T handles tree kill.
      ...(IS_WINDOWS ? { windowsHide: true } : { detached: true }),
      stdio: ['ignore', 'pipe', 'pipe'] as const,
      // Prevent child shep instances (e.g. worktree dev servers) from running
      // recoverAll() on the shared ~/.shep/data DB and killing our processes.
      env: { ...process.env, SHEP_SKIP_RECOVERY: '1' },
    });

    if (!child.pid) {
      log.error('spawn() returned no PID — process failed to start');
      throw new Error('Failed to spawn dev server: no PID returned');
    }

    log.info(`Process spawned — pid=${child.pid}`);

    const entry: DeploymentEntry = {
      pid: child.pid,
      child: child as ChildProcess,
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
    this.attachOutputListener(entry, 'stdout');
    this.attachOutputListener(entry, 'stderr');

    // Handle spawn errors (command not found, permission denied, etc.)
    (child as ChildProcess).on('error', (err) => {
      log.error(`Child process error for "${targetId}" (pid=${entry.pid}): ${err.message}`);
      entry.state = DeploymentState.Stopped;
      this.deployments.delete(targetId);
      this.dbDelete(targetId);
    });

    // Use 'close' instead of 'exit' — 'close' fires after stdio streams are
    // fully consumed, so entry.logs will contain all captured output.
    (child as ChildProcess).on('close', (code, signal) => {
      const wasBooting = entry.state === DeploymentState.Booting;
      log.info(
        `Process closed for "${targetId}" (pid=${entry.pid}) — code=${code}, signal=${signal}, wasBooting=${wasBooting}`
      );
      if (wasBooting) {
        log.warn(
          `Process exited while still in Booting state — dev server likely crashed on startup (code=${code}, signal=${signal}).`
        );
        const allLogs = entry.logs.getAll();
        const stdoutLines = allLogs.filter((l) => l.stream === 'stdout');
        const stderrLines = allLogs.filter((l) => l.stream === 'stderr');
        if (stdoutLines.length > 0) {
          log.warn(`[${targetId}] stdout:\n${stdoutLines.map((l) => l.line).join('\n')}`);
        }
        if (stderrLines.length > 0) {
          log.warn(`[${targetId}] stderr:\n${stderrLines.map((l) => l.line).join('\n')}`);
        }
        if (allLogs.length === 0) {
          log.warn(`[${targetId}] No output captured from the process.`);
        }
      }
      this.deployments.delete(targetId);
      this.dbDelete(targetId);
    });
  }

  /**
   * Get the current deployment status for a target.
   * Checks in-memory Map first, then falls back to DB for recovered deployments.
   * Validates PID liveness — cleans up if dead.
   */
  getStatus(targetId: string): DeploymentStatus | null {
    const entry = this.deployments.get(targetId);
    if (entry) {
      // Validate the process is still alive (handles orphan crashes)
      if (!this.deps.isAlive(entry.pid)) {
        log.info(`getStatus("${targetId}") — pid=${entry.pid} is dead, cleaning up`);
        this.deployments.delete(targetId);
        this.dbDelete(targetId);
        return null;
      }
      log.debug(
        `getStatus("${targetId}") — state=${entry.state}, url=${entry.url}, pid=${entry.pid}`
      );
      return { state: entry.state, url: entry.url };
    }

    // Check DB for entries not yet in memory (e.g., after hook re-mount)
    const row = this.dbFind(targetId);
    if (row) {
      if (this.deps.isAlive(row.pid)) {
        // Re-adopt into memory
        const recovered: DeploymentEntry = {
          pid: row.pid,
          child: null,
          state: row.state as DeploymentState,
          url: row.url,
          targetId: row.target_id,
          targetPath: row.target_path,
          targetType: row.target_type,
          stdoutBuffer: '',
          stderrBuffer: '',
          logs: new LogRingBuffer(),
        };
        this.deployments.set(targetId, recovered);
        return { state: recovered.state, url: recovered.url };
      }
      // Dead — clean up
      this.dbDelete(targetId);
    }

    log.debug(`getStatus("${targetId}") — no deployment found`);
    return null;
  }

  /**
   * List all tracked deployments with live processes.
   *
   * Merges in-memory entries with any DB rows not yet re-adopted. Any
   * dead processes encountered are cleaned up (both in-memory and DB).
   */
  listAll(): DeploymentStatusEntry[] {
    const entries: DeploymentStatusEntry[] = [];
    const seen = new Set<string>();

    // 1) In-memory entries (validated for liveness)
    for (const [targetId, entry] of this.deployments) {
      if (!this.deps.isAlive(entry.pid)) {
        log.info(`listAll — pid=${entry.pid} for "${targetId}" is dead, cleaning up`);
        this.deployments.delete(targetId);
        this.dbDelete(targetId);
        continue;
      }
      seen.add(targetId);
      entries.push({
        targetId,
        targetType: entry.targetType,
        state: entry.state,
        url: entry.url,
      });
    }

    // 2) DB rows not yet in memory — re-adopt live ones, drop dead
    const rows = this.dbFindAll();
    for (const row of rows) {
      if (seen.has(row.target_id)) continue;
      if (!this.deps.isAlive(row.pid)) {
        this.dbDelete(row.target_id);
        continue;
      }
      const recovered: DeploymentEntry = {
        pid: row.pid,
        child: null,
        state: row.state as DeploymentState,
        url: row.url,
        targetId: row.target_id,
        targetPath: row.target_path,
        targetType: row.target_type,
        stdoutBuffer: '',
        stderrBuffer: '',
        logs: new LogRingBuffer(),
      };
      this.deployments.set(row.target_id, recovered);
      entries.push({
        targetId: row.target_id,
        targetType: row.target_type,
        state: recovered.state,
        url: recovered.url,
      });
    }

    return entries;
  }

  /**
   * Stop a deployment gracefully: SIGTERM → poll → SIGKILL.
   */
  async stop(targetId: string): Promise<void> {
    const entry = this.deployments.get(targetId);
    if (!entry) {
      // Check DB in case it's a recovered orphan
      const row = this.dbFind(targetId);
      if (row && this.deps.isAlive(row.pid)) {
        log.info(`stop("${targetId}") — killing orphan process (pid=${row.pid})`);
        try {
          this.deps.kill(row.pid, 'SIGKILL');
        } catch {
          // already dead
        }
      }
      this.dbDelete(targetId);
      log.info(`stop("${targetId}") — no in-memory deployment found, cleaned DB`);
      return;
    }

    log.info(`stop("${targetId}") — sending SIGTERM to process tree (pid=${entry.pid})`);

    entry.logs.clear();

    // Send SIGTERM to process tree (tree-kill handles child processes)
    try {
      this.deps.kill(entry.pid, 'SIGTERM');
    } catch {
      log.info(`stop("${targetId}") — process already dead on SIGTERM`);
      this.deployments.delete(targetId);
      this.dbDelete(targetId);
      return;
    }

    // Wait for the process to exit
    const died = await this.pollUntilDead(entry.pid, MAX_WAIT_MS, POLL_INTERVAL_MS);

    if (!died) {
      log.warn(
        `stop("${targetId}") — process did not exit after ${MAX_WAIT_MS}ms, escalating to SIGKILL`
      );
      try {
        this.deps.kill(entry.pid, 'SIGKILL');
      } catch {
        // Process may have exited between check and kill
      }
    } else {
      log.info(`stop("${targetId}") — process exited gracefully`);
    }

    // Wait for the exit event to clean up the map (only if we have a ChildProcess handle)
    if (entry.child) {
      await this.waitForExit(entry.child);
    }

    // Ensure cleanup
    this.deployments.delete(targetId);
    this.dbDelete(targetId);
  }

  /**
   * Force-stop all tracked deployments immediately (for daemon shutdown).
   */
  stopAll(): void {
    for (const entry of this.deployments.values()) {
      entry.logs.clear();
      this.killProcess(entry);
    }
    // Also clean DB
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM dev_servers').run();
      } catch {
        // table might not exist yet
      }
    }
  }

  /**
   * Get the accumulated log buffer for a deployment.
   */
  getLogs(targetId: string): LogEntry[] | null {
    const entry = this.deployments.get(targetId);
    if (!entry) return null;
    return entry.logs.getAll();
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

  // ─── Database helpers ───────────────────────────────────────────────

  private dbUpsert(entry: DeploymentEntry): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO dev_servers
         (target_id, target_type, pid, state, url, target_path, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entry.targetId,
          entry.targetType,
          entry.pid,
          entry.state,
          entry.url,
          entry.targetPath,
          Date.now()
        );
    } catch (err) {
      log.warn(`dbUpsert failed for "${entry.targetId}": ${err}`);
    }
  }

  private dbUpdateState(targetId: string, state: DeploymentState, url: string | null): void {
    if (!this.db) return;
    try {
      this.db
        .prepare('UPDATE dev_servers SET state = ?, url = ? WHERE target_id = ?')
        .run(state, url, targetId);
    } catch (err) {
      log.warn(`dbUpdateState failed for "${targetId}": ${err}`);
    }
  }

  private dbDelete(targetId: string): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM dev_servers WHERE target_id = ?').run(targetId);
    } catch (err) {
      log.warn(`dbDelete failed for "${targetId}": ${err}`);
    }
  }

  private dbFind(targetId: string): DevServerRow | null {
    if (!this.db) return null;
    try {
      return (
        (this.db.prepare('SELECT * FROM dev_servers WHERE target_id = ?').get(targetId) as
          | DevServerRow
          | undefined) ?? null
      );
    } catch {
      return null;
    }
  }

  private dbFindAll(): DevServerRow[] {
    if (!this.db) return [];
    try {
      return this.db.prepare('SELECT * FROM dev_servers').all() as DevServerRow[];
    } catch {
      return [];
    }
  }

  // ─── Process helpers ────────────────────────────────────────────────

  private killProcess(entry: DeploymentEntry): void {
    try {
      this.deps.kill(entry.pid, 'SIGKILL');
    } catch {
      // Process may already be dead
    }
  }

  /**
   * Attach a line-buffered listener on stdout or stderr that calls parsePort
   * and accumulates log entries.
   */
  private attachOutputListener(entry: DeploymentEntry, stream: 'stdout' | 'stderr'): void {
    const bufferKey = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    const childStream = entry.child?.[stream];
    if (!childStream) {
      log.warn(`[${entry.targetId}] No ${stream} stream available — cannot attach listener`);
      return;
    }

    childStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      entry[bufferKey] += text;

      const lines = entry[bufferKey].split('\n');
      entry[bufferKey] = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        log.debug(`[${entry.targetId}] ${stream}: ${line}`);

        const logEntry: LogEntry = {
          targetId: entry.targetId,
          stream,
          line,
          timestamp: Date.now(),
        };
        entry.logs.push(logEntry);
        this.emitter.emit('log', logEntry);

        // Port detection (only while Booting)
        if (entry.state === DeploymentState.Booting) {
          const url = parsePort(line);
          if (url) {
            log.info(`[${entry.targetId}] Port detected — url="${url}" (from ${stream})`);
            entry.state = DeploymentState.Ready;
            entry.url = url;
            this.dbUpsert(entry);
          }
        }
      }
    });

    childStream.on('end', () => {
      const remaining = entry[bufferKey].trim();
      if (remaining) {
        log.debug(`[${entry.targetId}] ${stream} (flush): ${remaining}`);
        if (entry.state === DeploymentState.Booting) {
          const url = parsePort(remaining);
          if (url) {
            log.info(`[${entry.targetId}] Port detected in flushed buffer — url="${url}"`);
            entry.state = DeploymentState.Ready;
            entry.url = url;
            this.dbUpsert(entry);
          }
        }
        entry[bufferKey] = '';
      }
      log.debug(`[${entry.targetId}] ${stream} stream ended`);
    });
  }

  private async pollUntilDead(pid: number, maxMs: number, intervalMs: number): Promise<boolean> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (!this.deps.isAlive(pid)) {
        return true;
      }
    }
    return false;
  }

  private waitForExit(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 1000);
      child.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Async health check for a recovered entry. Probes the URL port via TCP.
   * If the port is not responding (zombie process), kills and re-spawns.
   * Fire-and-forget — errors are logged, never thrown.
   */
  private async validateAndRespawn(entry: DeploymentEntry): Promise<void> {
    if (!entry.url) return;

    const responding = await this.probePort(entry.url);
    if (responding) {
      log.info(`[${entry.targetId}] URL health check passed — "${entry.url}" is responding`);
      return;
    }

    log.warn(
      `[${entry.targetId}] URL health check FAILED — "${entry.url}" not responding, killing zombie (pid=${entry.pid})`
    );

    // Kill the zombie
    try {
      this.deps.kill(entry.pid, 'SIGKILL');
    } catch {
      // already dead
    }
    this.deployments.delete(entry.targetId);
    this.dbDelete(entry.targetId);

    // Re-spawn if target still exists
    if (!existsSync(join(entry.targetPath, 'package.json'))) {
      log.warn(
        `Skipping re-spawn for "${entry.targetId}" — no package.json at "${entry.targetPath}"`
      );
      return;
    }

    try {
      log.info(`Re-spawning dev server for "${entry.targetId}" at "${entry.targetPath}"`);
      this.start(entry.targetId, entry.targetPath, entry.targetType);
    } catch (err) {
      log.error(`Failed to re-spawn "${entry.targetId}": ${err}`);
    }
  }

  /**
   * TCP connect probe to check if a URL's port is accepting connections.
   * Returns true if the port responds within 2 seconds, false otherwise.
   */
  private probePort(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const port = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10);
        const socket = net.createConnection({ host: parsed.hostname, port });
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 2000);
        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }
}
