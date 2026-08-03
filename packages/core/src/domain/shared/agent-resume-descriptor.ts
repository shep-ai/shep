/**
 * Agent session resume descriptors.
 *
 * Describes how to reopen an existing agent CLI conversation: which binary to
 * run, with which arguments, in which working directory.
 *
 * Two invariants matter here, and both exist because of a shipped bug:
 *
 * 1. **No `--project` flag.** The web UI used to offer
 *    `claude --resume <id> --project <path>`, which fails when pasted — no
 *    supported agent accepts that flag. The working directory carries the
 *    project, which is why `cwd` is part of the descriptor.
 * 2. **argv, never a shell string.** Session ids come from filenames on disk,
 *    so the descriptor stays a binary plus an argument array and nothing
 *    downstream interpolates it into a shell.
 *
 * NOTE: relative imports inside `domain/` carry no file extension, because the
 * web package consumes `domain/` as raw TypeScript.
 */

import { AgentType } from '../generated/output';

/** The `--resume` flag every supported agent CLI uses. */
const RESUME_FLAG = '--resume';

/**
 * Session ids are derived from filenames on disk, and the embedded terminal
 * spawns a shell that the resume command is written into. Ids are therefore
 * restricted to characters that carry no meaning to a shell — anything else is
 * rejected rather than escaped, since no legitimate provider id needs them.
 */
const SAFE_SESSION_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Executable name per agent type. Note Cursor's CLI binary is `cursor-agent`,
 * not `cursor` — assuming otherwise is why a single hardcoded `claude` string
 * could not serve every provider.
 */
const RESUME_BINARIES: Partial<Record<AgentType, string>> = {
  [AgentType.ClaudeCode]: 'claude',
  [AgentType.CodexCli]: 'codex',
  [AgentType.Cursor]: 'cursor-agent',
};

/** How to relaunch a session. */
export interface AgentResumeDescriptor {
  /** Executable to spawn */
  binary: string;
  /** Arguments, already tokenized — never join these into a shell string */
  args: string[];
  /** Working directory the agent resolves the session from */
  cwd: string;
  /** Display form, safe to show or copy into a terminal */
  displayCommand: string;
}

/**
 * Build the resume descriptor for a session.
 *
 * @returns The descriptor, or null when the agent type has no known resume
 *   invocation. Returning null rather than guessing keeps callers from
 *   spawning a wrong command.
 */
export function buildAgentResumeDescriptor(
  agentType: AgentType | string,
  sessionId: string,
  cwd: string
): AgentResumeDescriptor | null {
  const binary = RESUME_BINARIES[agentType as AgentType];
  if (binary === undefined) return null;
  if (cwd === '') return null;
  if (!SAFE_SESSION_ID.test(sessionId)) return null;

  const args = [RESUME_FLAG, sessionId];

  return {
    binary,
    args,
    cwd,
    displayCommand: `${binary} ${args.join(' ')}`,
  };
}

/** Whether resuming is supported for the given agent type. */
export function supportsSessionResume(agentType: AgentType | string): boolean {
  return RESUME_BINARIES[agentType as AgentType] !== undefined;
}
