/**
 * SqliteDatabaseBusyError remediation text
 *
 * The message is read by people AND by agents running inside a feature
 * worktree. It used to tell the reader to run `shep daemon stop` — an agent
 * following that advice kills the daemon that hosts it (and every other
 * running feature). It also named commands that do not exist.
 */

import { describe, it, expect } from 'vitest';
import { SqliteDatabaseBusyError } from '@/infrastructure/errors/sqlite-database-busy-error.js';

describe('SqliteDatabaseBusyError', () => {
  const error = new SqliteDatabaseBusyError('/home/u/.shep/data');

  it('never instructs the reader to stop or restart the daemon', () => {
    expect(error.message).not.toMatch(/shep (daemon )?(stop|restart)\b/);
  });

  it('warns against stopping Shep to clear the lock', () => {
    expect(error.remediation).toMatch(/do not stop/i);
  });

  it('only names commands that exist', () => {
    expect(error.message).not.toContain('shep daemon');
    expect(error.remediation).toContain('shep status');
  });
});
