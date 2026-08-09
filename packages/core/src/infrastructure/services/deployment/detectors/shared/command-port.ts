/**
 * Explicit port extraction from a detected command.
 *
 * This is NOT `parse-port.ts`, which reads a dev server's stdout to find the
 * URL it announced at runtime. This module answers a different question
 * before anything is spawned: did the author write a port into the command
 * itself?
 *
 * ## Why only explicit forms
 *
 * The extracted value becomes the run plan's `expectedPort`, which the verify
 * node uses as a TCP fallback when log parsing finds nothing. The failure
 * modes are asymmetric: an UNSET port degrades to log parsing, while a WRONG
 * port probes a socket nothing is listening on, reports a healthy server as
 * failed, and can trigger a remediation agent that edits working code.
 *
 * So a port is taken only when it is a fact the author wrote down — an
 * in-command `--port`/`-p` flag here, or (in the Compose detector) a declared
 * `ports:` mapping. Never a scan of source files or `.env`.
 */

import { PORT_MAX, PORT_MIN } from '@/domain/shared/port-range.js';

// Re-exported so the detectors keep importing their port bounds from one
// neighbouring module; the values themselves live in domain/shared because
// the application layer needs them too and cannot import infrastructure.
export { PORT_MAX, PORT_MIN };

/**
 * Flags that introduce a port value, matched as WHOLE tokens.
 *
 * A prefix match would wrongly claim `--ports` or `--port-file`.
 */
const PORT_FLAGS: readonly string[] = ['--port', '-p'];

/**
 * Single-valued framework defaults, used only when the framework has been
 * positively identified by its own detector (a `bin/rails` executable, a
 * `:phoenix` dependency in `mix.exs`, a `manage.py`).
 *
 * These three are here because each has exactly one well-established default
 * that has been stable for a decade. Frameworks whose default depends on
 * configuration are deliberately absent — a guess there is worse than nothing.
 */
export const FRAMEWORK_DEFAULT_PORTS = {
  Rails: 3000,
  Phoenix: 4000,
  Django: 8000,
} as const;

/** Parse a bare token as a valid port number, or `undefined`. */
function toPort(token: string | undefined): number | undefined {
  if (!token || !/^\d+$/.test(token)) return undefined;
  const port = Number(token);
  return port >= PORT_MIN && port <= PORT_MAX ? port : undefined;
}

/**
 * Extract an explicitly declared port from a command string.
 *
 * Recognises `--port <n>`, `--port=<n>` and the same two forms with `-p`.
 * Returns `undefined` for every other case — a missing value, a non-numeric
 * or shell-expanded value, a value outside {@link PORT_MIN}–{@link PORT_MAX},
 * or a longer flag that merely starts with `--port`.
 *
 * @param command - The command a detector produced.
 * @returns The first explicitly declared port, or `undefined`.
 */
export function extractExplicitPort(command: string): number | undefined {
  const tokens = command.split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const equalsIndex = token.indexOf('=');

    if (equalsIndex !== -1) {
      if (!PORT_FLAGS.includes(token.slice(0, equalsIndex))) continue;
      const port = toPort(token.slice(equalsIndex + 1));
      if (port !== undefined) return port;
      continue;
    }

    if (!PORT_FLAGS.includes(token)) continue;
    const port = toPort(tokens[i + 1]);
    if (port !== undefined) return port;
  }

  return undefined;
}
