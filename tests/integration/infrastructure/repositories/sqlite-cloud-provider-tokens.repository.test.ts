/**
 * SQLiteCloudProviderTokensRepository integration tests.
 * In-memory SQLite + full migrations + real LocalSecretBox.
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteCloudProviderTokensRepository } from '@/infrastructure/repositories/sqlite-cloud-provider-tokens.repository.js';
import {
  LocalSecretBox,
  LOCAL_SECRET_KEY_BYTES,
} from '@/infrastructure/services/crypto/local-secret-box.js';
import { CloudDeploymentProvider } from '@/domain/generated/output.js';

describe('SQLiteCloudProviderTokensRepository', () => {
  let db: Database.Database;
  let repo: SQLiteCloudProviderTokensRepository;
  let box: LocalSecretBox;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    box = new LocalSecretBox(randomBytes(LOCAL_SECRET_KEY_BYTES));
    repo = new SQLiteCloudProviderTokensRepository(db, box);
  });

  it('creates the cloud_provider_tokens table via migration 061', () => {
    expect(tableExists(db, 'cloud_provider_tokens')).toBe(true);
  });

  it('round-trips a token', async () => {
    await repo.set(CloudDeploymentProvider.CloudflarePages, 'cf-token-abcdef');
    expect(await repo.get(CloudDeploymentProvider.CloudflarePages)).toBe('cf-token-abcdef');
  });

  it('returns null when no token is stored', async () => {
    expect(await repo.get(CloudDeploymentProvider.Vercel)).toBeNull();
  });

  it('stores ciphertext, not the plaintext, on disk', async () => {
    const plaintext = 'super-secret-cloudflare-token-9999';
    await repo.set(CloudDeploymentProvider.CloudflarePages, plaintext);
    const row = db
      .prepare('SELECT token_ciphertext FROM cloud_provider_tokens WHERE provider = ?')
      .get(CloudDeploymentProvider.CloudflarePages) as { token_ciphertext: Buffer } | undefined;
    expect(row).toBeDefined();
    expect(row!.token_ciphertext.toString('utf8')).not.toBe(plaintext);
    expect(row!.token_ciphertext.includes(Buffer.from(plaintext, 'utf8'))).toBe(false);
  });

  it('replaces an existing token for the same provider', async () => {
    await repo.set(CloudDeploymentProvider.CloudflarePages, 'first');
    await repo.set(CloudDeploymentProvider.CloudflarePages, 'second');
    expect(await repo.get(CloudDeploymentProvider.CloudflarePages)).toBe('second');
    const { count } = db
      .prepare('SELECT COUNT(*) as count FROM cloud_provider_tokens WHERE provider = ?')
      .get(CloudDeploymentProvider.CloudflarePages) as { count: number };
    expect(count).toBe(1);
  });

  it('removes a stored token', async () => {
    await repo.set(CloudDeploymentProvider.CloudflarePages, 'doomed');
    await repo.remove(CloudDeploymentProvider.CloudflarePages);
    expect(await repo.get(CloudDeploymentProvider.CloudflarePages)).toBeNull();
  });

  it('remove is a no-op when the provider has no token', async () => {
    await expect(repo.remove(CloudDeploymentProvider.Vercel)).resolves.not.toThrow();
  });

  it('listConnected returns only providers that currently have a token', async () => {
    await repo.set(CloudDeploymentProvider.CloudflarePages, 't1');
    await repo.set(CloudDeploymentProvider.Vercel, 't2');
    const connected = await repo.listConnected();
    expect(new Set(connected)).toEqual(
      new Set([CloudDeploymentProvider.CloudflarePages, CloudDeploymentProvider.Vercel])
    );
    await repo.remove(CloudDeploymentProvider.Vercel);
    expect(await repo.listConnected()).toEqual([CloudDeploymentProvider.CloudflarePages]);
  });
});
