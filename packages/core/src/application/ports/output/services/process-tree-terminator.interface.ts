/**
 * Process Tree Terminator (port)
 *
 * Ends an OS process AND everything it started. A feature worker runs its
 * agent CLIs as subprocesses; signalling only the worker's pid leaves those
 * running — orphaned, still holding the worktree and spending tokens — and a
 * worker that ignores SIGTERM is never stopped at all.
 *
 * Lives behind a port so use cases (Stop, the liveness sweep) never call
 * `process.kill` or import a process-control package themselves.
 */

export interface ProcessTreeTerminationOptions {
  /**
   * Kill immediately instead of asking first. For a process whose event loop is
   * wedged: its SIGTERM handler can never run, so a graceful request only adds
   * the grace period before the inevitable SIGKILL.
   */
  force?: boolean;
}

export interface IProcessTreeTerminator {
  /**
   * Terminate `pid` and its descendants.
   *
   * Asks politely first (SIGTERM), then force-kills whatever is still alive
   * after a bounded grace period. On Windows there is no graceful request, so
   * this is a single forced tree kill. Resolves once the tree is gone or has
   * been force-killed; never rejects — a process that already exited is the
   * expected case.
   */
  terminateTree(pid: number, options?: ProcessTreeTerminationOptions): Promise<void>;
}
