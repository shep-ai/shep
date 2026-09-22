/**
 * CLI side of the agent self-harm guard.
 *
 * The decision (is this process inside a Shep agent run, and would the command
 * stop that run's host?) lives in `domain/shared/agent-run-environment.ts`.
 * This only reports a refusal the way every command reports an error.
 */

import { messages } from '../ui/index.js';

/**
 * Print a refusal and fail the command.
 *
 * @returns true when the command must stop here.
 */
export function reportAgentRunRefusal(refusal: string | undefined): boolean {
  if (refusal === undefined) return false;
  messages.error(refusal);
  process.exitCode = 1;
  return true;
}
