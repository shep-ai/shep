/**
 * What `shep ps` shows (spec 144): one row per process Shep recorded, ready to
 * render. Every surface (CLI table, JSON, a future TUI or web panel) reads the
 * same rows.
 */

import type {
  AgentRunStatus,
  AgentType,
  ShepProcessKind,
  ShepProcessState,
} from '../../../domain/generated/output.js';

export interface ShepProcessRow {
  kind: ShepProcessKind;
  pid: number;
  state: ShepProcessState;
  /** Absent when the OS gave no numbers (Windows, or the process is gone). */
  cpuPercent?: number;
  rssBytes?: number;
  startedAt?: Date;
  /** How long a running process has been up; absent for one that is not running. */
  uptimeMs?: number;
  runId?: string;
  runShortId?: string;
  runStatus?: AgentRunStatus;
  agentType?: AgentType;
  agentName?: string;
  featureId?: string;
  featureShortId?: string;
  featureName?: string;
  /** Feature worker log, for `shep feat logs`. */
  logPath?: string;
  /** Daemon only: the web UI it serves. */
  url?: string;
}

export interface ShepProcessSummary {
  running: number;
  crashed: number;
  exited: number;
}

export interface ShepProcessList {
  generatedAt: Date;
  processes: ShepProcessRow[];
  summary: ShepProcessSummary;
}

export interface ListShepProcessesInput {
  /** Also list runs whose process exited (finished, failed, or paused at a gate). */
  includeAll?: boolean;
}

export interface StopShepProcessResult {
  stopped: boolean;
  message: string;
  runId?: string;
}
