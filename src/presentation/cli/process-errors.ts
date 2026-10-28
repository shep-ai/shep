/**
 * Triage for errors that reach the CLI's process-level handlers.
 *
 * `shep ui` and the daemon serve the web UI from the CLI process. When a
 * browser closes a connection mid-request (a tab closed, a navigation, a
 * dropped network), Node destroys the incoming request with
 * `Error: aborted` (code ECONNRESET). If nothing listens for that error it
 * becomes an uncaught exception — and the CLI's handler exits, taking the
 * daemon down for every other tab and agent. That error is the client's
 * business, not the server's.
 */

/** Node's code and message for an incoming request whose client went away. */
const CLIENT_ABORT_CODE = 'ECONNRESET';
const CLIENT_ABORT_MESSAGE = 'aborted';

/**
 * True for the error Node raises on an incoming HTTP request that its client
 * aborted. Only that exact pair: an outbound reset ("read ECONNRESET",
 * "socket hang up") is a real failure for whoever made the request.
 */
export function isClientDisconnect(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === CLIENT_ABORT_CODE &&
    error.message === CLIENT_ABORT_MESSAGE
  );
}

/** Exit code for an error nothing else handled. */
const UNHANDLED_ERROR_EXIT_CODE = 1;

export interface UncaughtExceptionHandlerDeps {
  /** Usage metrics for a crash (content-free). */
  record: (error: unknown) => void;
  /** Tell the user what went wrong. */
  report: (error: Error) => void;
  /** Debug-level log. */
  debug: (text: string) => void;
  exit: (code: number) => void;
}

/**
 * The CLI's `uncaughtException` handler: a client that went away mid-request
 * is logged at debug level and the process keeps serving; anything else is
 * recorded, reported and ends the process.
 */
export function createUncaughtExceptionHandler(
  deps: UncaughtExceptionHandlerDeps
): (error: Error) => void {
  return (error) => {
    if (isClientDisconnect(error)) {
      deps.debug(`Ignored a client that disconnected mid-request (${error.message})`);
      return;
    }
    deps.record(error);
    deps.report(error);
    deps.exit(UNHANDLED_ERROR_EXIT_CODE);
  };
}
