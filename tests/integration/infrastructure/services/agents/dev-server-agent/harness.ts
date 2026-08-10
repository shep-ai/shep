/**
 * Shared harness for the dev-server-agent end-to-end integration suite
 * (spec 103, task-15).
 *
 * Builds the REAL composition — DevServerAgentService orchestrating the real
 * LangGraph over the real DeploymentService, real SQLite (in-memory +
 * migrations), real SQLiteDevServerRunPlanRepository, real
 * DependencyInstaller (spy-wrapped so call counts are assertable), and REAL
 * child processes spawned from throwaway fixture repos. The ONLY mocked
 * seams are the agent boundaries: `executorProvider` and `structuredCaller`
 * never reach a live LLM.
 *
 * Hermeticity: fixture dev servers run `node server.js` (no package-manager
 * binaries beyond the one deterministic-path test that runs a real
 * `npm install` against an EMPTY dependency set, which never touches the
 * network) and setup steps use `node setup.js` — never a registry-hitting
 * install.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { vi, type Mock } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { DeploymentService } from '@/infrastructure/services/deployment/deployment.service.js';
import { DependencyInstaller } from '@/infrastructure/services/deployment/dependency-installer.js';
import { SQLiteDevServerRunPlanRepository } from '@/infrastructure/repositories/sqlite-dev-server-run-plan.repository.js';
import { DevServerAgentService } from '@/infrastructure/services/agents/dev-server-agent/dev-server-agent.service.js';
import type { DevServerAnalysis } from '@/infrastructure/services/agents/dev-server-agent/schemas/run-plan-analysis.schema.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import type {
  DeploymentStatus,
  LogEntry,
} from '@/application/ports/output/services/deployment-service.interface.js';
import type { DeploymentState, DevServerRunPlan } from '@/domain/generated/output.js';
import { RunPlanSource } from '@/domain/generated/output.js';
import {
  computeConfigHash,
  computeInstallHash,
} from '@/infrastructure/services/deployment/config-hash.js';

/** Filename of the pid marker the fixture server writes once it is listening. */
export const SERVER_PID_FILE = 'server.pid';
/** Filename of the marker the fixture setup script writes when it ran. */
export const SETUP_MARKER_FILE = 'setup-ran.marker';
/** Default name of the fixture dev-server entry point. */
export const SERVER_FILE = 'server.js';

/** True on Windows runners, where npm and file-handle release are far slower. */
const IS_WINDOWS = process.platform === 'win32';

/**
 * Default bound for status/log polling.
 *
 * This budget covers the WHOLE Analyzing -> Installing -> Booting -> Ready
 * sequence, and the Installing leg runs a real `npm install`. On a Windows
 * runner npm needs 15-20s just to report "up to date" against a fixture that
 * already has node_modules, which left under a third of a 30s budget for the
 * boot it is actually asserting on. Size the wait for the slowest leg on the
 * slowest platform, not for the leg under test.
 */
const DEFAULT_WAIT_TIMEOUT_MS = IS_WINDOWS ? 90_000 : 30_000;
/** Poll interval — tight enough to observe the brief Installing window. */
const DEFAULT_POLL_INTERVAL_MS = 25;
/**
 * Settle time after stopAll() before removing fixture dirs.
 *
 * Windows has no graceful kill: the child tree is force-killed and the OS
 * releases its file handles asynchronously, so removing the fixture directory
 * too soon fails with EBUSY. That failure also masks the real one — a timed-out
 * wait reports twice, once for the timeout and once for the teardown it caused.
 */
const CLEANUP_SETTLE_MS = IS_WINDOWS ? 1_000 : 150;
/**
 * rmSync retry budget for fixture dirs — Windows holds locks well past exit.
 * Total per fixture is retries x delay, and cleanup runs inside vitest's
 * hookTimeout, so this stays well under it even with several fixtures tracked.
 */
const CLEANUP_RM_MAX_RETRIES = IS_WINDOWS ? 12 : 5;
/** Delay between rmSync retries; total budget is retries x delay. */
const CLEANUP_RM_RETRY_DELAY_MS = 250;

/**
 * Per-test timeout for the dev-server-agent suite.
 *
 * Must exceed {@link DEFAULT_WAIT_TIMEOUT_MS}: if vitest kills the test first,
 * the wait never gets to throw, and the failure arrives without the last status
 * and log tail that make it diagnosable from CI output alone.
 */
export const TEST_TIMEOUT_MS = DEFAULT_WAIT_TIMEOUT_MS + 30_000;

/**
 * CommonJS fixture dev server: binds an ephemeral port for real (so recovery
 * URL health probes pass), writes its pid to {@link SERVER_PID_FILE}, prints
 * a parse-port-compatible ready line, and stays alive via setInterval.
 */
export const SERVER_JS_SOURCE = `
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const server = net.createServer(() => {});
server.listen(0, () => {
  const { port } = server.address();
  fs.writeFileSync(path.join(__dirname, '${SERVER_PID_FILE}'), String(process.pid));
  console.log('ready - started server on 0.0.0.0:' + port + ', url: http://localhost:' + port);
});
setInterval(() => {}, 1000);
`;

/**
 * CommonJS fixture setup script: sleeps briefly (widening the observable
 * Installing window for state-capture assertions), writes a marker file
 * proving it ran, then exits 0.
 */
export const SETUP_JS_SOURCE = `
const fs = require('node:fs');
const path = require('node:path');
setTimeout(() => {
  fs.writeFileSync(path.join(__dirname, '${SETUP_MARKER_FILE}'), 'ok');
  process.exit(0);
}, 400);
`;

/** Options for {@link makeNodeFixture}. */
export interface NodeFixtureOptions {
  /**
   * package.json flavour:
   * - 'dev-script': `{"scripts":{"dev":"node server.js"}}` — deterministic
   *   detection succeeds.
   * - 'no-scripts': manifest without any dev/start/serve script —
   *   detection fails, agent analysis required.
   * - 'none': no package.json at all — detection fails.
   */
  packageJson?: 'dev-script' | 'no-scripts' | 'none';
  /** Pre-create an (empty) node_modules directory. Default false. */
  nodeModules?: boolean;
  /** Write the ready-printing server.js. Default true. */
  serverFile?: boolean;
  /** Write the marker-writing setup.js. Default false. */
  setupScript?: boolean;
}

/** Build a throwaway fixture repo in a temp dir. Caller tracks cleanup. */
export function makeNodeFixture(options: NodeFixtureOptions = {}): string {
  const { packageJson = 'dev-script', nodeModules = false, serverFile = true } = options;
  const dir = mkdtempSync(join(tmpdir(), 'shep-dsa-'));

  if (packageJson !== 'none') {
    const manifest: Record<string, unknown> = {
      name: 'shep-dsa-fixture',
      version: '1.0.0',
      private: true,
    };
    if (packageJson === 'dev-script') {
      manifest.scripts = { dev: `node ${SERVER_FILE}` };
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  }
  if (serverFile) {
    writeFileSync(join(dir, SERVER_FILE), SERVER_JS_SOURCE);
  }
  if (options.setupScript) {
    writeFileSync(join(dir, 'setup.js'), SETUP_JS_SOURCE);
  }
  if (nodeModules) {
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
  }

  return dir;
}

/** A deployable analysis stub for a plain `node server.js` fixture. */
export function nodeServerAnalysis(overrides: Partial<DevServerAnalysis> = {}): DevServerAnalysis {
  return {
    deployable: true,
    reason: 'Plain Node.js TCP server detected',
    command: `node ${SERVER_FILE}`,
    cwd: '.',
    expectedPort: null,
    language: 'node',
    framework: null,
    setupCommands: [],
    ...overrides,
  };
}

/** Options for {@link createHarness}. */
export interface HarnessOptions {
  /**
   * Remediation executor seam:
   * - omitted → no-op executor that records calls and resolves.
   * - a function → executed on every `execute()` call (repo-fixing stubs).
   * - null → NO executor provider at all (degradation scenarios).
   */
  executor?: ((prompt: string) => Promise<void> | void) | null;
  /**
   * Structured analysis seam:
   * - omitted → guard stub whose invocation FAILS the scenario (fast-path
   *   tests assert zero agent involvement).
   * - a value/function → returned from `structuredCaller.call()`.
   * - null → NO structured caller (degradation scenarios).
   */
  analysis?: DevServerAnalysis | (() => DevServerAnalysis) | null;
}

/** Everything a scenario needs, plus deterministic cleanup. */
export interface DevServerAgentHarness {
  db: Database.Database;
  deploymentService: DeploymentService;
  runPlanRepository: SQLiteDevServerRunPlanRepository;
  service: DevServerAgentService;
  /** Spy over `IAgentExecutor.execute` (remediation calls). */
  executeSpy: Mock;
  /** Spy over `IAgentExecutorProvider.getExecutor`. */
  getExecutorSpy: Mock;
  /** Spy over `IStructuredAgentCaller.call` (analysis calls). */
  structuredCallSpy: Mock;
  /** Spy over the REAL DependencyInstaller.install (pass-through). */
  installSpy: Mock;
  /** Every 'log' event emitted by the deployment service, in order. */
  events: LogEntry[];
  /** Track a fixture dir for cleanup. */
  trackFixture(dir: string): string;
  /** Track an extra DeploymentService instance (restart-simulation). */
  trackService(service: DeploymentService): DeploymentService;
  /** stopAll every service, close the DB, remove fixtures (retry-hardened). */
  cleanup(): Promise<void>;
}

/** Build the real composition with only the agent seams stubbed. */
export async function createHarness(options: HarnessOptions = {}): Promise<DevServerAgentHarness> {
  const db = createInMemoryDatabase();
  await runSQLiteMigrations(db);

  const deploymentService = new DeploymentService();
  deploymentService.setDatabase(db);

  const runPlanRepository = new SQLiteDevServerRunPlanRepository(db);

  // Executor seam — never a live LLM.
  const executeSpy = vi.fn(async (prompt: string) => {
    if (typeof options.executor === 'function') {
      await options.executor(prompt);
    }
    return { result: 'stub remediation complete' };
  });
  const executorStub = { execute: executeSpy } as unknown as IAgentExecutor;
  const getExecutorSpy = vi.fn(async () => executorStub);
  const executorProvider = options.executor === null ? null : { getExecutor: getExecutorSpy };

  // Structured-caller seam — never a live LLM.
  const structuredCallSpy = vi.fn(async () => {
    const { analysis } = options;
    if (analysis === undefined || analysis === null) {
      throw new Error('structuredCaller.call must not be invoked in this scenario');
    }
    return typeof analysis === 'function' ? analysis() : analysis;
  });
  const structuredCaller =
    options.analysis === null ? null : ({ call: structuredCallSpy } as IStructuredAgentCaller);

  // REAL installer, spy-wrapped so scenarios can assert call counts.
  const realInstaller = new DependencyInstaller();
  const installSpy = vi.fn(
    (dir: string, pm: string, onLine: (line: string) => void, timeoutMs?: number) =>
      realInstaller.install(dir, pm, onLine, timeoutMs)
  );

  const service = new DevServerAgentService({
    deploymentService,
    runPlanRepository,
    executorProvider,
    structuredCaller,
    installer: { install: installSpy },
  });

  const events: LogEntry[] = [];
  deploymentService.on('log', (entry) => events.push(entry));

  const fixtures: string[] = [];
  const services: DeploymentService[] = [deploymentService];

  return {
    db,
    deploymentService,
    runPlanRepository,
    service,
    executeSpy,
    getExecutorSpy,
    structuredCallSpy,
    installSpy,
    events,
    trackFixture: (dir) => {
      fixtures.push(dir);
      return dir;
    },
    trackService: (extra) => {
      services.push(extra);
      return extra;
    },
    cleanup: async () => {
      for (const svc of services) {
        try {
          svc.stopAll();
        } catch {
          // Best-effort teardown — never mask the test result.
        }
      }
      // Give SIGKILLed children a beat to release fixture-dir handles
      // before removal (Windows file-lock lesson).
      await sleep(CLEANUP_SETTLE_MS);
      db.close();
      for (const dir of fixtures) {
        rmSync(dir, {
          recursive: true,
          force: true,
          maxRetries: CLEANUP_RM_MAX_RETRIES,
          retryDelay: CLEANUP_RM_RETRY_DELAY_MS,
        });
      }
    },
  };
}

/** Upsert a run-plan row keyed on the fixture's CURRENT config/install hashes. */
export async function seedFreshRunPlan(
  harness: DevServerAgentHarness,
  fixtureDir: string,
  overrides: Partial<DevServerRunPlan> = {}
): Promise<DevServerRunPlan> {
  const now = new Date();
  const plan: DevServerRunPlan = {
    repoPath: fixtureDir,
    source: RunPlanSource.Deterministic,
    command: `node ${SERVER_FILE}`,
    cwd: fixtureDir,
    setupCommands: [],
    configHash: computeConfigHash(fixtureDir),
    installStampHash: computeInstallHash(fixtureDir),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await harness.runPlanRepository.upsert(plan);
  return plan;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Options for {@link waitForStatus}. */
export interface WaitForStatusOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Every distinct state observed while polling is added here. */
  seenStates?: Set<DeploymentState>;
}

/**
 * Poll `deploymentService.getStatus(targetId)` until the predicate accepts
 * the snapshot (the service is fire-and-track — polling is the contract).
 * Rejects with a diagnostic message (last status + recent log lines) on
 * timeout so failures are debuggable from CI output alone.
 */
export async function waitForStatus(
  harness: DevServerAgentHarness,
  targetId: string,
  predicate: (status: DeploymentStatus | null) => boolean,
  options: WaitForStatusOptions = {}
): Promise<DeploymentStatus | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  let status: DeploymentStatus | null = null;
  for (;;) {
    status = harness.deploymentService.getStatus(targetId);
    if (status) options.seenStates?.add(status.state);
    if (predicate(status)) return status;
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(pollIntervalMs);
  }

  const tail = harness.events
    .filter((entry) => entry.targetId === targetId)
    .slice(-15)
    .map((entry) => `  [${entry.stream}] ${entry.line}`)
    .join('\n');
  throw new Error(
    `waitForStatus("${targetId}") timed out after ${timeoutMs}ms — ` +
      `last status: ${JSON.stringify(status)}\nrecent log events:\n${tail || '  (none)'}`
  );
}

/** Convenience: wait until getStatus reports the given state. */
export async function waitForState(
  harness: DevServerAgentHarness,
  targetId: string,
  state: DeploymentState,
  options: WaitForStatusOptions = {}
): Promise<DeploymentStatus> {
  const status = await waitForStatus(harness, targetId, (s) => s?.state === state, options);
  // The predicate guarantees non-null here.
  return status as DeploymentStatus;
}

/**
 * Wait until a 'log' event line for the target matches. Used as the
 * run-completion signal (the graph service always emits a terminal line:
 * success URL or failure reason).
 */
export async function waitForLogLine(
  harness: DevServerAgentHarness,
  targetId: string,
  match: string | RegExp,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS
): Promise<LogEntry> {
  const startedAt = Date.now();
  const matches = (line: string): boolean =>
    typeof match === 'string' ? line.includes(match) : match.test(line);

  for (;;) {
    const found = harness.events.find(
      (entry) => entry.targetId === targetId && matches(entry.line)
    );
    if (found) return found;
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  const tail = harness.events
    .filter((entry) => entry.targetId === targetId)
    .slice(-20)
    .map((entry) => `  [${entry.stream}] ${entry.line}`)
    .join('\n');
  throw new Error(
    `waitForLogLine("${targetId}", ${String(match)}) timed out after ${timeoutMs}ms.\n` +
      `captured log events:\n${tail || '  (none)'}`
  );
}

/**
 * Wait until a 'log' event line for the target has been emitted at least
 * `count` times. Needed when the same line recurs per attempt and only a
 * specific occurrence marks run completion (remediation-exhaustion).
 */
export async function waitForLogLineCount(
  harness: DevServerAgentHarness,
  targetId: string,
  match: string | RegExp,
  count: number,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS
): Promise<void> {
  const startedAt = Date.now();
  const matches = (line: string): boolean =>
    typeof match === 'string' ? line.includes(match) : match.test(line);
  const occurrences = (): number =>
    harness.events.filter((entry) => entry.targetId === targetId && matches(entry.line)).length;

  for (;;) {
    if (occurrences() >= count) return;
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error(
    `waitForLogLineCount("${targetId}", ${String(match)}, ${count}) timed out after ` +
      `${timeoutMs}ms — saw ${occurrences()} occurrence(s)`
  );
}

/** Unique per-test deployment target id. */
export function uniqueTargetId(): string {
  return `dsa-${randomUUID().slice(0, 8)}`;
}

/** True when a pid is alive (cross-platform, signal 0 probe). */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
