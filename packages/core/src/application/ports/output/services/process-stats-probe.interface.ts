/**
 * Process Stats Probe (port) — spec 144
 *
 * CPU and memory of OS processes, for `shep ps` and `shep status`. One call
 * samples every PID, so a refreshing monitor spawns one helper per refresh,
 * not one per row.
 */

export interface ProcessStats {
  /** CPU use as the OS reports it (percent of one core, may exceed 100). */
  cpuPercent: number;
  /** Resident memory in bytes. */
  rssBytes: number;
  /**
   * The process has exited but its parent has not reaped it yet. It still
   * answers `kill(pid, 0)`, so liveness checks alone call it alive.
   */
  zombie: boolean;
}

export interface IProcessStatsProbe {
  /**
   * Stats for each PID the OS still knows. PIDs that are gone are omitted.
   * Never throws: a failure, a timeout or an unsupported platform (Windows)
   * yields an empty map, and callers show the numbers as unavailable.
   */
  sample(pids: readonly number[]): Promise<Map<number, ProcessStats>>;
}
