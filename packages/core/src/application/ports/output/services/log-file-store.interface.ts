/**
 * Log File Store (port)
 *
 * Read/delete access to the worker log directory `~/.shep/logs`. The files
 * are large by design: `[tool]` lines carry full tool-input JSON and
 * `[text]` lines full assistant prose. `PruneLogsUseCase` is the only thing
 * that deletes them — on demand, and on the data-retention schedule.
 */

/** One log file on disk. */
export interface LogFileInfo {
  /** Absolute path. */
  path: string;
  /** Basename, e.g. `worker-abc123.log`. */
  name: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export interface ILogFileStore {
  /** Absolute path of the directory these files live in. */
  getLogsDirectory(): string;

  /** Every regular file in the log directory. Empty when it does not exist. */
  list(): Promise<LogFileInfo[]>;

  /** Delete one log file. Rejects when the file cannot be removed. */
  remove(path: string): Promise<void>;

  /**
   * The last `maxLines` complete lines of a log file, oldest first, without
   * line terminators. Reads only the end of a large file. Empty when the file
   * does not exist yet (a run that has not written anything).
   */
  readTail(path: string, maxLines: number): Promise<string[]>;
}
