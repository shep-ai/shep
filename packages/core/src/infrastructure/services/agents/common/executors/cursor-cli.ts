/**
 * Facts about the Cursor CLI shared by the one-shot executor
 * (`cursor-agent --print`) and the interactive executor (`cursor-agent acp`).
 *
 * One copy, so the two executors cannot disagree about the binary, the install
 * hint or the model id the CLI accepts — a second model table would drift the
 * way LESSONS.md's "Adding a Model to the Catalog" entry describes.
 */

/** Agent name used in failure messages. */
export const CURSOR_AGENT_NAME = 'Cursor';

/** Binary name on PATH (POSIX) and the command a Windows shell invokes. */
export const CURSOR_BINARY = 'cursor-agent';

/** Shown when the binary is missing, so the user knows how to fix it. */
export const CURSOR_NOT_FOUND_MESSAGE =
  'Cursor agent CLI not found. Please install Cursor and ensure the "cursor-agent" command is available on PATH.';

/**
 * Map legacy / Shep-canonical model IDs to current Cursor CLI ids from
 * `cursor-agent --list-models`. Live catalog ids pass through unchanged.
 */
const CURSOR_MODEL_MAP: Record<string, string> = {
  // Obsolete Composer
  'composer-1.5': 'composer-2.5',
  // Pre-rename Claude aliases → current Cursor CLI ids. Cursor ids encode
  // effort; the canonical Opus 5.5 id maps to medium, its own default effort.
  'claude-opus-5-5': 'claude-opus-5-5-medium',
  'claude-opus-5': 'claude-opus-5-high',
  'claude-opus-4-8': 'claude-opus-4-8-high',
  'claude-opus-4-7': 'claude-opus-4-7-high',
  'claude-opus-4-6': 'claude-4.6-opus-high',
  'claude-sonnet-5': 'claude-sonnet-5-high',
  'claude-sonnet-4-6': 'claude-4.6-sonnet-medium',
  'claude-haiku-4-5': 'claude-4.5-sonnet',
  'grok-code': 'cursor-grok-4.6-high',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro',
};

/** The Cursor CLI id for a Shep model id; unknown ids pass through. */
export function toCursorModelName(model: string): string {
  return CURSOR_MODEL_MAP[model] ?? model;
}
