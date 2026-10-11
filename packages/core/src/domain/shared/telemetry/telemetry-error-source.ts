/**
 * Content-free error description for the error.unhandled event (spec 133).
 *
 * An error message or full stack can contain paths, prompts or repository
 * names, so the event carries only the error's class and a hash of its top
 * stack frame reduced to `function@file-basename:line`. Hashing happens in
 * infrastructure; this module only reduces the frame.
 */

const FRAME_PREFIX = /^\s*at\s+/;
const FRAME_WITH_FUNCTION = /^(.*?)\s+\((.*)\)$/;
const LOCATION = /^(.*):(\d+):\d+$/;
const NODE_INTERNAL = /^node:/;
const ANONYMOUS = '<anonymous>';

interface ParsedFrame {
  fn: string;
  file: string;
  line: string;
}

function parseFrame(rawLine: string): ParsedFrame | null {
  const frame = rawLine.replace(FRAME_PREFIX, '');
  const withFunction = frame.match(FRAME_WITH_FUNCTION);
  const fn = withFunction ? withFunction[1] : ANONYMOUS;
  const location = (withFunction ? withFunction[2] : frame).match(LOCATION);
  if (!location) return null;
  return { fn, file: location[1], line: location[2] };
}

function basename(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

/**
 * The first stack frame reduced to `function@basename:line`, preferring a
 * frame outside Node internals. Null when the stack has no parsable frame.
 */
export function topStackFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  const frames = stack
    .split('\n')
    .filter((line) => FRAME_PREFIX.test(line))
    .map(parseFrame)
    .filter((frame): frame is ParsedFrame => frame !== null);
  const frame = frames.find((candidate) => !NODE_INTERNAL.test(candidate.file)) ?? frames[0];
  if (!frame) return null;
  return `${frame.fn}@${basename(frame.file)}:${frame.line}`;
}

/** The error's constructor name, or `NonError:<type>` for thrown non-errors. */
export function errorClassOf(error: unknown): string {
  if (error instanceof Error) return error.constructor.name || error.name;
  return `NonError:${error === null ? 'null' : typeof error}`;
}
