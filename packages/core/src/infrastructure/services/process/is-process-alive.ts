/**
 * Check whether a process with the given PID is still running.
 *
 * Uses `process.kill(pid, 0)` which sends signal 0 (no-op) to test existence.
 * Returns false when the PID does not exist. A zombie (exited, not yet reaped
 * by its parent) still exists, so it returns TRUE for one; `shep ps` reads
 * the process state from `ps` to tell them apart (spec 144).
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
