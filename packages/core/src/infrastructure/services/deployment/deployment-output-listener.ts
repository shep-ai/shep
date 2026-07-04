/**
 * Line-buffered stdout/stderr listener for spawned dev servers.
 *
 * Accumulates log entries into the entry's ring buffer, emits them to
 * subscribers, and performs port/URL detection while the deployment is
 * Booting — transitioning it to Ready via the onReady hook (which persists
 * the entry to the dev_servers table).
 */

import { DeploymentState } from '@/domain/generated/output.js';
import type { LogEntry } from '@/application/ports/output/services/deployment-service.interface.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { parsePort } from './parse-port.js';
import type { DeploymentEntry } from './deployment-entry.js';

const log = createDeploymentLogger('[DeploymentService]');

export interface OutputListenerHooks {
  /** Publish a captured log line to real-time subscribers. */
  emitLog(logEntry: LogEntry): void;
  /** Persist the entry after its Booting → Ready transition. */
  onReady(entry: DeploymentEntry): void;
}

/** Transition a Booting entry to Ready when a line reveals the server URL. */
function detectReady(
  entry: DeploymentEntry,
  line: string,
  source: string,
  hooks: OutputListenerHooks
): void {
  if (entry.state !== DeploymentState.Booting) return;
  const url = parsePort(line);
  if (!url) return;
  log.info(`[${entry.targetId}] Port detected — url="${url}" (from ${source})`);
  entry.state = DeploymentState.Ready;
  entry.url = url;
  hooks.onReady(entry);
}

/**
 * Dump a crashed-while-Booting process's captured output to the deployment
 * log so startup failures are diagnosable after the process is gone.
 */
export function logBootCrashOutput(
  entry: DeploymentEntry,
  code: number | null,
  signal: NodeJS.Signals | null
): void {
  log.warn(
    `Process exited while still in Booting state — dev server likely crashed on startup (code=${code}, signal=${signal}).`
  );
  const allLogs = entry.logs.getAll();
  const stdoutLines = allLogs.filter((l) => l.stream === 'stdout');
  const stderrLines = allLogs.filter((l) => l.stream === 'stderr');
  if (stdoutLines.length > 0) {
    log.warn(`[${entry.targetId}] stdout:\n${stdoutLines.map((l) => l.line).join('\n')}`);
  }
  if (stderrLines.length > 0) {
    log.warn(`[${entry.targetId}] stderr:\n${stderrLines.map((l) => l.line).join('\n')}`);
  }
  if (allLogs.length === 0) {
    log.warn(`[${entry.targetId}] No output captured from the process.`);
  }
}

/**
 * Attach a line-buffered listener on stdout or stderr that calls parsePort
 * and accumulates log entries.
 */
export function attachOutputListener(
  entry: DeploymentEntry,
  stream: 'stdout' | 'stderr',
  hooks: OutputListenerHooks
): void {
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
      hooks.emitLog(logEntry);

      // Port detection (only while Booting)
      detectReady(entry, line, stream, hooks);
    }
  });

  childStream.on('end', () => {
    const remaining = entry[bufferKey].trim();
    if (remaining) {
      log.debug(`[${entry.targetId}] ${stream} (flush): ${remaining}`);
      detectReady(entry, remaining, 'flushed buffer', hooks);
      entry[bufferKey] = '';
    }
    log.debug(`[${entry.targetId}] ${stream} stream ended`);
  });
}
