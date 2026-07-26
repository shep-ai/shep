import { describe, it, expect, vi } from 'vitest';

import { SqliteNativeBindingError } from '@/infrastructure/errors/sqlite-native-binding-error.js';

// Simulate better-sqlite3's native addon failing to load, exactly as it does
// when the compiled binary is missing for the running Node ABI.
vi.mock('better-sqlite3', () => ({
  default: class {
    constructor() {
      throw new Error('Could not locate the bindings file. Tried:\n → .../better_sqlite3.node');
    }
  },
}));

// Keep the connection off the real filesystem — the failure we care about
// happens at `new Database()`, before any pragma runs.
vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  ensureShepDirectory: vi.fn().mockResolvedValue(undefined),
  getShepDbPath: vi.fn(() => ':memory:'),
}));

describe('getSQLiteConnection with a missing native binding', () => {
  it('translates the raw bindings failure into a SqliteNativeBindingError', async () => {
    const { getSQLiteConnection } = await import(
      '@/infrastructure/persistence/sqlite/connection.js'
    );

    await expect(getSQLiteConnection()).rejects.toBeInstanceOf(SqliteNativeBindingError);
  });
});
