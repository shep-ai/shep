/**
 * SQLite Cloud Provider Tokens Repository
 *
 * Implements ICloudProviderTokensRepository using better-sqlite3.
 * Encrypts tokens with LocalSecretBox before persisting, decrypts on read.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';

import type { ICloudProviderTokensRepository } from '../../application/ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import type { CloudDeploymentProvider } from '../../domain/generated/output.js';
import { LocalSecretBox } from '../services/crypto/local-secret-box.js';

interface CloudProviderTokenRow {
  provider: string;
  token_ciphertext: Buffer;
  token_iv: Buffer;
  token_tag: Buffer;
  created_at: number;
  updated_at: number;
}

@injectable()
export class SQLiteCloudProviderTokensRepository implements ICloudProviderTokensRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly secretBox: LocalSecretBox
  ) {}

  async get(provider: CloudDeploymentProvider): Promise<string | null> {
    const row = this.db
      .prepare<
        [string],
        CloudProviderTokenRow
      >('SELECT provider, token_ciphertext, token_iv, token_tag, created_at, updated_at FROM cloud_provider_tokens WHERE provider = ?')
      .get(provider);
    if (!row) return null;
    return this.secretBox.decrypt({
      ciphertext: row.token_ciphertext,
      iv: row.token_iv,
      tag: row.token_tag,
    });
  }

  async set(provider: CloudDeploymentProvider, token: string): Promise<void> {
    const now = Date.now();
    const blob = this.secretBox.encrypt(token);
    const stmt = this.db.prepare(`
      INSERT INTO cloud_provider_tokens (
        provider, token_ciphertext, token_iv, token_tag, created_at, updated_at
      ) VALUES (
        @provider, @token_ciphertext, @token_iv, @token_tag, @created_at, @updated_at
      )
      ON CONFLICT(provider) DO UPDATE SET
        token_ciphertext = excluded.token_ciphertext,
        token_iv = excluded.token_iv,
        token_tag = excluded.token_tag,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      provider,
      token_ciphertext: blob.ciphertext,
      token_iv: blob.iv,
      token_tag: blob.tag,
      created_at: now,
      updated_at: now,
    });
  }

  async remove(provider: CloudDeploymentProvider): Promise<void> {
    this.db.prepare('DELETE FROM cloud_provider_tokens WHERE provider = ?').run(provider);
  }

  async listConnected(): Promise<CloudDeploymentProvider[]> {
    const rows = this.db
      .prepare<[], { provider: string }>('SELECT provider FROM cloud_provider_tokens')
      .all();
    return rows.map((r) => r.provider as CloudDeploymentProvider);
  }
}
