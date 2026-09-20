/**
 * Builds the error message for a subprocess agent CLI that exited non-zero.
 *
 * Agent CLIs report *why* they failed on stdout, as the text of their final
 * result event. stderr carries setup diagnostics that are emitted on healthy
 * runs too, so treating it as the cause names the wrong thing: a run that died
 * on "Your organization has disabled Claude subscription access for Claude
 * Code" was reported as an unrelated workspace-trust warning, purely because
 * that warning was the only thing on stderr. The real reason never surfaced.
 *
 * So the CLI's own result text wins when it has one, stderr stays as secondary
 * detail rather than being dropped, and the exit code is always present.
 */

/** Longest each part may contribute before it is cut short. */
const MAX_DETAIL_LENGTH = 1000;

const TRUNCATION_SUFFIX = '… (truncated)';

export interface SubprocessFailure {
  /** Exit code the process reported. */
  readonly code: number;
  /** Text of the CLI's final result event, when it emitted one. */
  readonly resultText?: string;
  /** Everything the process wrote to stderr. */
  readonly stderr?: string;
}

function clamp(text: string): string {
  return text.length <= MAX_DETAIL_LENGTH
    ? text
    : `${text.slice(0, MAX_DETAIL_LENGTH)}${TRUNCATION_SUFFIX}`;
}

/**
 * Compose a single-line explanation of a non-zero exit.
 *
 * @param failure - Exit code plus whatever the process reported on each stream
 * @returns Message naming the exit code and the most specific reason available
 */
export function describeSubprocessFailure({ code, resultText, stderr }: SubprocessFailure): string {
  const reported = resultText?.trim() ?? '';
  const diagnostics = stderr?.trim() ?? '';
  const base = `Process exited with code ${code}`;

  if (!reported) {
    return diagnostics ? `${base}: ${clamp(diagnostics)}` : base;
  }

  if (!diagnostics || reported.includes(diagnostics)) {
    return `${base}: ${clamp(reported)}`;
  }

  return `${base}: ${clamp(reported)} (stderr: ${clamp(diagnostics)})`;
}
