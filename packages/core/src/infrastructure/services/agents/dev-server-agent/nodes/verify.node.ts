/**
 * verify node — wait bounded for the spawned dev server to become Ready.
 *
 * Polls DeploymentService status until one of:
 * - Ready with a parsed URL → success (`resultUrl`).
 * - Deployment gone (null status) or Stopped → failure with the last log
 *   tail (`failureReason` + `lastErrorTail`).
 * - Timeout → TCP fallback probe on `plan.expectedPort` (servers that never
 *   print their URL); probe success yields a localhost URL, otherwise the
 *   run fails with the log tail.
 *
 * When `failureReason` is already set (start_server failed) the node is a
 * pass-through — the graph routes to remediate on the existing failure.
 * `sleep` and `probePort` are injectable so tests never wait on real timers.
 */

import { createConnection } from 'node:net';
import { DeploymentState } from '@/domain/generated/output.js';
import type { DevServerAgentNodeFn } from '../types.js';

/** Default overall readiness bound. */
export const DEFAULT_VERIFY_TIMEOUT_MS = 90_000;
/** Default status poll interval. */
export const DEFAULT_POLL_INTERVAL_MS = 500;
/** Number of trailing log lines captured on failure. */
const ERROR_TAIL_LINES = 50;
/** Per-connection bound for the TCP fallback probe. */
const PROBE_TIMEOUT_MS = 1_000;

/** Status snapshot consumed by the node (state + parsed URL). */
export interface VerifyStatusSnapshot {
  state: DeploymentState;
  url: string | null;
}

/** Minimal log entry shape consumed for the error tail. */
export interface VerifyLogEntry {
  line: string;
  stream: string;
}

/** Dependencies for the verify node. */
export interface VerifyNodeDeps {
  /** Deployment status lookup (IDeploymentService.getStatus). */
  getStatus: (targetId: string) => VerifyStatusSnapshot | null;
  /** Deployment log lookup (IDeploymentService.getLogs). */
  getLogs: (targetId: string) => VerifyLogEntry[] | null;
  /** TCP readiness probe; defaults to {@link probePortDefault}. */
  probePort?: (port: number) => Promise<boolean>;
  /** Overall readiness bound; defaults to {@link DEFAULT_VERIFY_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Poll interval; defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  pollIntervalMs?: number;
  /** Injectable sleep for fake-timer tests; defaults to a real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Live log sink (SSE trail). */
  log: (l: string) => void;
}

const sleepDefault = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Default TCP probe: attempt a loopback connection to the port with a 1s
 * bound. Resolves true on connect, false on error/timeout — never throws.
 */
export const probePortDefault = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: PROBE_TIMEOUT_MS });
    const finish = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

/** Build the verify node from injected dependencies. */
export const createVerifyNode = (deps: VerifyNodeDeps): DevServerAgentNodeFn => {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const sleep = deps.sleep ?? sleepDefault;
  const probePort = deps.probePort ?? probePortDefault;

  return async (state) => {
    // start_server already failed — pass through, the graph remediates.
    if (state.failureReason !== null) {
      return {};
    }

    const errorTail = (): string[] =>
      (deps.getLogs(state.targetId) ?? []).slice(-ERROR_TAIL_LINES).map((entry) => entry.line);

    let elapsedMs = 0;
    for (;;) {
      const status = deps.getStatus(state.targetId);

      if (status === null || status.state === DeploymentState.Stopped) {
        const reason = 'Dev server exited before becoming ready';
        deps.log(reason);
        return { failureReason: reason, lastErrorTail: errorTail() };
      }

      if (status.state === DeploymentState.Ready && status.url !== null) {
        deps.log(`dev server ready at ${status.url}`);
        return { resultUrl: status.url };
      }

      if (elapsedMs >= timeoutMs) {
        break;
      }
      await sleep(pollIntervalMs);
      elapsedMs += pollIntervalMs;
    }

    // Timed out without a parsed URL — fall back to a TCP probe on the
    // plan's expected port (covers servers that never print their URL).
    const expectedPort = state.runPlan?.expectedPort;
    if (expectedPort !== undefined && (await probePort(expectedPort))) {
      const url = `http://localhost:${expectedPort}`;
      deps.log(`dev server reachable via TCP probe on port ${expectedPort}`);
      return { resultUrl: url };
    }

    const reason = `Dev server did not become ready within ${timeoutMs}ms`;
    deps.log(reason);
    return { failureReason: reason, lastErrorTail: errorTail() };
  };
};
