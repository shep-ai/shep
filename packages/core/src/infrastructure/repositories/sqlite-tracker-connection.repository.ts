/**
 * SQLite tracker connection repository (spec 122). Secrets are encrypted with
 * the shared LocalSecretBox and read back only through getSecret.
 */

import type Database from 'better-sqlite3';
import type { TrackerConnection } from '../../domain/generated/output.js';
import type { ITrackerConnectionRepository } from '../../application/ports/output/repositories/tracker-connection-repository.interface.js';
import type { LocalSecretBox } from '../services/crypto/local-secret-box.js';
import {
  trackerConnectionFromDatabase,
  trackerConnectionToDatabase,
  type TrackerConnectionRow,
} from '../persistence/sqlite/mappers/tracker-sync.mapper.js';

/** Every column except the secret ones. */
const COLUMNS = `id, provider, name, slug, space_id, site_url, account_email, account_name,
  status, last_error, last_checked_at, created_at, updated_at`;

export class SQLiteTrackerConnectionRepository implements ITrackerConnectionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly secretBox: LocalSecretBox
  ) {}

  async list(): Promise<TrackerConnection[]> {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM tracker_connections ORDER BY created_at ASC`)
      .all() as TrackerConnectionRow[];
    return rows.map(trackerConnectionFromDatabase);
  }

  async findById(id: string): Promise<TrackerConnection | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM tracker_connections WHERE id = ?`)
      .get(id) as TrackerConnectionRow | undefined;
    return row ? trackerConnectionFromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<TrackerConnection | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM tracker_connections WHERE slug = ?`)
      .get(slug) as TrackerConnectionRow | undefined;
    return row ? trackerConnectionFromDatabase(row) : null;
  }

  async create(connection: TrackerConnection, secret: string): Promise<void> {
    const blob = this.secretBox.encrypt(secret);
    this.db
      .prepare(
        `INSERT INTO tracker_connections (${COLUMNS}, secret_ciphertext, secret_iv, secret_tag)
         VALUES (@id, @provider, @name, @slug, @space_id, @site_url, @account_email,
           @account_name, @status, @last_error, @last_checked_at, @created_at, @updated_at,
           @secret_ciphertext, @secret_iv, @secret_tag)`
      )
      .run({
        ...trackerConnectionToDatabase(connection),
        secret_ciphertext: blob.ciphertext,
        secret_iv: blob.iv,
        secret_tag: blob.tag,
      });
  }

  async update(connection: TrackerConnection): Promise<void> {
    this.db
      .prepare(
        `UPDATE tracker_connections SET provider = @provider, name = @name, slug = @slug,
           space_id = @space_id, site_url = @site_url, account_email = @account_email,
           account_name = @account_name, status = @status, last_error = @last_error,
           last_checked_at = @last_checked_at, updated_at = @updated_at
         WHERE id = @id`
      )
      .run(trackerConnectionToDatabase(connection));
  }

  async getSecret(id: string): Promise<string | null> {
    const row = this.db
      .prepare(
        'SELECT secret_ciphertext, secret_iv, secret_tag FROM tracker_connections WHERE id = ?'
      )
      .get(id) as { secret_ciphertext: Buffer; secret_iv: Buffer; secret_tag: Buffer } | undefined;
    if (!row) return null;
    return this.secretBox.decrypt({
      ciphertext: row.secret_ciphertext,
      iv: row.secret_iv,
      tag: row.secret_tag,
    });
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM tracker_connections WHERE id = ?').run(id);
  }
}
