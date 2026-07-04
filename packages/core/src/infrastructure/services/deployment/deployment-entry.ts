/**
 * In-memory deployment registry entry and transient-state helpers.
 *
 * A DeploymentEntry tracks one dev server per targetId. Transient entries
 * (Analyzing / Installing) are pre-spawn placeholders driven by the
 * dev-server-agent graph: they have no process (pid 0, child null), live
 * ONLY in memory, and are never persisted to the dev_servers table.
 */

import type { ChildProcess } from 'node:child_process';
import { DeploymentState } from '@/domain/generated/output.js';
import type { LogRingBuffer } from './log-ring-buffer.js';

export interface DeploymentEntry {
  pid: number;
  child: ChildProcess | null; // null for recovered (orphan) processes and transient entries
  state: DeploymentState;
  url: string | null;
  targetId: string;
  targetPath: string;
  targetType: string;
  stdoutBuffer: string;
  stderrBuffer: string;
  logs: LogRingBuffer;
}

/** Placeholder pid for transient (pre-spawn) entries — there is no process. */
export const TRANSIENT_PID = 0;

/** Pre-spawn states surfaced via setTransientState — no process, in-memory only. */
export const TRANSIENT_STATES: ReadonlySet<DeploymentState> = new Set([
  DeploymentState.Analyzing,
  DeploymentState.Installing,
]);

/** True when the entry is a transient pre-spawn placeholder (no process). */
export function isTransientEntry(entry: DeploymentEntry): boolean {
  return TRANSIENT_STATES.has(entry.state);
}
