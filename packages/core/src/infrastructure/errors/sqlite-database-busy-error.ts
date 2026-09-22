/**
 * SQLite Database Busy Error
 *
 * Shep runs several OS processes against one database file — the daemon, the
 * CLI, and one detached worker per running feature — so "another process holds
 * the database" is an ordinary situation, not a corrupted install. Raw, it
 * arrives as `SqliteError: database is locked` with a stack trace, which reads
 * like a bug in Shep rather than a thing the user can act on.
 *
 * Shaped like {@link SqliteNativeBindingError} (message + remediation) so the
 * CLI can give it the same dedicated branch. The remediation is also folded
 * into the message, so even the generic error handler prints something the
 * user can act on.
 */

const LOCK_WAIT_SECONDS = 5;

/**
 * Builds the remediation text.
 *
 * @param databasePath - The database that could not be opened.
 */
function buildRemediation(databasePath: string): string {
  return [
    `Another process is holding the Shep database (${databasePath}) and did not`,
    `release it within ${LOCK_WAIT_SECONDS} seconds.`,
    '',
    'Try, in order:',
    '  1. Wait a moment and retry — running agents hold it only briefly.',
    '  2. Check what is running:   shep status',
    '',
    'Do not stop or restart Shep to clear this: the daemon hosts the running',
    'feature agents, and an agent working inside a Shep feature would be',
    'stopping itself.',
    '',
    'If nothing is running, a crashed process may have left a stale lock — the',
    'lock clears on its own once that process is gone.',
  ].join('\n');
}

export class SqliteDatabaseBusyError extends Error {
  readonly remediation: string;

  constructor(databasePath: string, cause?: unknown) {
    const remediation = buildRemediation(databasePath);
    super(`Could not open the Shep database — it is locked by another process\n\n${remediation}`, {
      cause,
    });
    this.name = 'SqliteDatabaseBusyError';
    this.remediation = remediation;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
