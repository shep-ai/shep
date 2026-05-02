/**
 * SQLite GitHub Integration Repository
 *
 * Mirrors SQLiteCloudProviderTokensRepository but for a single fixed row
 * (id = 1) — there's only one GitHub integration per shep instance.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';

import type {
  GithubIntegrationStatus,
  IGithubIntegrationRepository,
} from '../../application/ports/output/repositories/github-integration.repository.interface.js';
import { LocalSecretBox } from '../services/crypto/local-secret-box.js';

interface GithubIntegrationRow {
  id: number;
  token_ciphertext: Buffer;
  token_iv: Buffer;
  token_tag: Buffer;
  created_at: number;
  updated_at: number;
}

const ROW_ID = 1;

@injectable()
export class SQLiteGithubIntegrationRepository implements IGithubIntegrationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly secretBox: LocalSecretBox
  ) {}

  async get(): Promise<string | null> {
    const row = this.db
      .prepare<
        [number],
        GithubIntegrationRow
      >('SELECT id, token_ciphertext, token_iv, token_tag, created_at, updated_at FROM github_integration WHERE id = ?')
      .get(ROW_ID);
    if (!row) return null;
    return this.secretBox.decrypt({
      ciphertext: row.token_ciphertext,
      iv: row.token_iv,
      tag: row.token_tag,
    });
  }

  async set(token: string): Promise<void> {
    const now = Date.now();
    const blob = this.secretBox.encrypt(token);
    this.db
      .prepare(
        `INSERT INTO github_integration (
           id, token_ciphertext, token_iv, token_tag, created_at, updated_at
         ) VALUES (
           @id, @token_ciphertext, @token_iv, @token_tag, @created_at, @updated_at
         )
         ON CONFLICT(id) DO UPDATE SET
           token_ciphertext = excluded.token_ciphertext,
           token_iv = excluded.token_iv,
           token_tag = excluded.token_tag,
           updated_at = excluded.updated_at`
      )
      .run({
        id: ROW_ID,
        token_ciphertext: blob.ciphertext,
        token_iv: blob.iv,
        token_tag: blob.tag,
        created_at: now,
        updated_at: now,
      });
  }

  async remove(): Promise<void> {
    this.db.prepare('DELETE FROM github_integration WHERE id = ?').run(ROW_ID);
  }

  async getStatus(): Promise<GithubIntegrationStatus> {
    const row = this.db
      .prepare<
        [number],
        { created_at: number; updated_at: number }
      >('SELECT created_at, updated_at FROM github_integration WHERE id = ?')
      .get(ROW_ID);
    if (!row) return { connected: false, connectedAt: null, updatedAt: null };
    return { connected: true, connectedAt: row.created_at, updatedAt: row.updated_at };
  }
}
