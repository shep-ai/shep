/**
 * Deliver a prompt to an agent CLI that only accepts it as an argument
 * (Copilot's `-p`, Cline's positional task).
 *
 * The argument is either the prompt itself or a one-line pointer to a temp
 * file holding it, which the agent reads with its own file tool:
 *
 *   - on Windows, ALWAYS the pointer. npm installs these CLIs as `.cmd`
 *     shims, which run through cmd.exe (`process/spawn-function.ts`), and a
 *     cmd.exe command line cannot carry a line break, is capped at 8191
 *     characters and grows when `"` / `%` are escaped — so no prompt is safe
 *     to put on it;
 *   - elsewhere, the pointer only for a prompt longer than the policy's
 *     limit, to stay clear of argument-length failures.
 *
 * Synchronous on purpose: callers attach their process listeners right after
 * spawning, and an await here would let a fast child close first.
 */

import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';

/** Owner read/write only: the prompt can hold private repository content. */
const PROMPT_FILE_MODE = 0o600;

export interface PromptArgumentPolicy {
  /** Longest prompt passed inline off Windows; longer ones go through a file. */
  maxInlineChars: number;
  /** Temp file name prefix, so a leaked file names its agent. */
  filePrefix: string;
}

export interface PreparedPrompt {
  /** What to pass as the prompt argument. */
  promptArg: string;
  /** True when `promptArg` points at a temp file. */
  usedFileIndirection: boolean;
  /** Remove the temp file, if any. Safe to call more than once. */
  cleanup: () => void;
}

/** One line on purpose: a line break cannot pass through cmd.exe. */
function pointerTo(promptFilePath: string): string {
  return (
    `The full original user prompt is stored in this file: ${promptFilePath}. ` +
    'Read that file completely, then execute its instructions exactly as if its content was ' +
    'passed directly as the prompt. Do not summarize or reinterpret the instructions before ' +
    'executing them.'
  );
}

/**
 * Decide how `prompt` reaches the CLI and, when needed, write its temp file.
 *
 * @param prompt - The prompt as the caller wants the agent to see it.
 * @param policy - The agent's inline size limit and temp file prefix.
 * @param platform - Read per call so tests can exercise the Windows branch.
 */
export function preparePromptArgument(
  prompt: string,
  policy: PromptArgumentPolicy,
  platform: NodeJS.Platform = process.platform
): PreparedPrompt {
  const useFile = platform === WINDOWS_PLATFORM || prompt.length > policy.maxInlineChars;
  if (!useFile) {
    return { promptArg: prompt, usedFileIndirection: false, cleanup: () => undefined };
  }

  const promptFilePath = join(tmpdir(), `${policy.filePrefix}${randomUUID()}.txt`);
  writeFileSync(promptFilePath, prompt, { encoding: 'utf8', mode: PROMPT_FILE_MODE });

  return {
    promptArg: pointerTo(promptFilePath),
    usedFileIndirection: true,
    cleanup: () => {
      try {
        rmSync(promptFilePath, { force: true });
      } catch {
        // A file Windows still holds open is removed with the temp dir later.
      }
    },
  };
}
