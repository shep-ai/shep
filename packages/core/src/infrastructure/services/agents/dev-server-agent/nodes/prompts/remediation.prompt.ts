/**
 * Remediation prompt builder — pure function, no I/O.
 *
 * Builds the prompt the remediate node sends to the agent after a dev
 * server failed to start or become ready (CI-fix-loop shape: exact failed
 * command, captured output tail, failure reason, attempt number, and
 * tightly-scoped fix instructions).
 */

/** Input for {@link buildRemediationPrompt}. */
export interface RemediationPromptInput {
  /** Exact command that failed (null when no run plan was resolved). */
  command: string | null;
  /** Working directory the command ran in (target path fallback). */
  cwd: string;
  /** Human-readable failure reason from the graph state. */
  failureReason: string | null;
  /** Trailing stdout/stderr lines captured from the failed run. */
  errorTail: string[];
  /** 1-based remediation attempt number. */
  attempt: number;
}

/** Maximum error-tail lines embedded in the prompt. */
const MAX_TAIL_LINES = 50;

/** Build the dev-server remediation prompt (pure). */
export function buildRemediationPrompt(input: RemediationPromptInput): string {
  const commandLine =
    input.command !== null
      ? `- Command: \`${input.command}\``
      : '- Command: (no run plan could be resolved for this repository)';
  const failureLine =
    input.failureReason ?? 'The dev server failed to start (no further detail was captured).';
  const tail = input.errorTail.slice(-MAX_TAIL_LINES);
  const tailBlock =
    tail.length > 0 ? tail.join('\n') : '(no output was captured from the failed run)';

  return `You are fixing a broken dev server in this repository (remediation attempt ${input.attempt}).

The dev server failed to start or never became ready.

## What was run

${commandLine}
- Working directory: \`${input.cwd}\`

## Failure reason

${failureLine}

## Captured output (tail)

\`\`\`
${tailBlock}
\`\`\`

## Instructions

1. Diagnose the root cause from the output above and FIX the underlying problem in this repository — e.g. missing dependencies, broken configuration, port conflicts, bad or missing scripts.
2. Make minimal, targeted changes — change only what is necessary to make the dev server start.
3. You may run user-space, non-interactive commands only (installs, builds, quick checks). Never use sudo and never run commands that prompt for input.
4. Do NOT start long-running dev servers yourself — the system will retry the start after your fix.
5. Do NOT commit — leave all changes in the working tree.
6. Finish with a short summary of what was changed and why it fixes the failure.`;
}
