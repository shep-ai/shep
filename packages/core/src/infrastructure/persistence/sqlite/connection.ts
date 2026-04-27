/**
 * SQLite Connection Module
 *
 * Provides singleton database connection to ~/.shep/data
 * Configures pragmas for optimal performance and reliability.
 */

import Database from 'better-sqlite3';
import {
  ensureShepDirectory,
  getShepDbPath,
} from '../../services/filesystem/shep-directory.service.js';

/**
 * Singleton database instance.
 * Initialized on first call to getSQLiteConnection().
 */
let dbInstance: Database.Database | null = null;

/**
 * Gets or creates the SQLite database connection.
 * Singleton pattern ensures only one connection exists.
 *
 * On first call:
 * - Ensures ~/.shep/ directory exists
 * - Creates database file at ~/.shep/data
 * - Configures pragmas for performance and reliability
 *
 * @returns Database connection instance
 *
 * @example
 * ```typescript
 * const db = await getSQLiteConnection();
 * const settings = db.prepare('SELECT * FROM settings').get();
 * ```
 */
export async function getSQLiteConnection(): Promise<Database.Database> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure ~/.shep/ directory exists
  await ensureShepDirectory();

  // Get database path
  const dbPath = getShepDbPath();

  // Create database connection
  dbInstance = new Database(dbPath, {
    // eslint-disable-next-line no-console
    verbose: process.env.DEBUG_SQL ? console.log : undefined,
  });

  // Configure pragmas for production use
  // WAL mode: Better concurrency, write performance
  dbInstance.pragma('journal_mode = WAL');

  // NORMAL synchronous: Balance between safety and performance
  dbInstance.pragma('synchronous = NORMAL');

  // Enable foreign keys
  dbInstance.pragma('foreign_keys = ON');

  // Defensive mode: Additional safety checks
  dbInstance.pragma('defensive = ON');

  // Cache size: 16384 pages (~64MB with 4KB page size). The web UI's SSE
  // poll re-reads features/runs/timings every 2s; the previous 8MB cache
  // was too small to keep the hot pages resident across cycles.
  dbInstance.pragma('cache_size = -65536');

  // Keep temp tables (sorts, GROUP BY spills, intermediate joins) in RAM
  // instead of writing them to disk.
  dbInstance.pragma('temp_store = MEMORY');

  // Memory-map up to 256MB of the database file for faster reads. The OS
  // backs this with the page cache; cost is virtual address space only.
  dbInstance.pragma('mmap_size = 268435456');

  // Wait up to 5s for write locks before failing with SQLITE_BUSY. Without
  // this, concurrent SSE polls + watcher writes (PR sync, notifications,
  // auto-archive) can race and surface "database is locked" errors.
  dbInstance.pragma('busy_timeout = 5000');

  return dbInstance;
}

/**
 * Closes the database connection.
 * Should be called when application exits.
 * Safe to call multiple times.
 */
export function closeSQLiteConnection(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Gets the current database instance without creating one.
 * Returns null if connection hasn't been established yet.
 *
 * @returns Database instance or null
 */
export function getExistingConnection(): Database.Database | null {
  return dbInstance;
}
