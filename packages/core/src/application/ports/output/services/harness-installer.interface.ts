/**
 * Harness Installer (Output Port, spec 150)
 *
 * Materialises a learned-harness version for one agent run: writes skills,
 * subagents, scripts and hooks where that agent family reads them (never
 * committed, never colliding with the repository's own files), and returns the
 * always-on text for the agent's system prompt or task prompt. An empty or
 * absent version installs nothing and changes no executor option.
 */

import type { AgentType, LearnedHarnessVersion } from '../../../../domain/generated/output.js';

export interface HarnessInstallRequest {
  /** The adopted (or probed) version; null removes anything a previous run installed. */
  version: LearnedHarnessVersion | null;
  /** Agent that will run; selects the surface through the agent catalog. */
  agentType: AgentType;
  /** Absolute path of the worktree the agent runs in. */
  worktreePath: string;
}

export interface HarnessInstallation {
  /** Version installed, when any. */
  versionId?: string;
  /** Text to append to the agent's system prompt (system-prompt surfaces). */
  systemPrompt?: string;
  /** Section to add to the task prompt (always-on text and indexes on prompt surfaces). */
  promptSection?: string;
  /** Absolute path of a settings file carrying hooks, when the surface installs hooks. */
  settingsPath?: string;
  /** Worktree-relative paths written. */
  writtenPaths: string[];
  /** Components the surface could not install (e.g. hooks on an agent without hooks). */
  warnings: string[];
}

export interface IHarnessInstaller {
  install(request: HarnessInstallRequest): Promise<HarnessInstallation>;
}
