/**
 * Webhook identity store — the per-installation secret + instance id that
 * lets hooks keep validating across restarts and lets each Shep installation
 * recognise (and delete) only the GitHub hooks it created.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateWebhookIdentity } from '@/infrastructure/services/webhook/webhook-identity.store.js';

const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;

describe('loadOrCreateWebhookIdentity', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-webhook-identity-'));
    file = join(dir, 'github-webhook-identity.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an identity on first use and returns the same one afterwards', () => {
    const first = loadOrCreateWebhookIdentity(file);
    const second = loadOrCreateWebhookIdentity(file);

    expect(first.instanceId).toMatch(/\S/);
    expect(first.secret.length).toBeGreaterThanOrEqual(32);
    expect(second).toEqual(first);
  });

  it.skipIf(process.platform === 'win32')('writes the secret readable by the owner only', () => {
    loadOrCreateWebhookIdentity(file);
    expect(statSync(file).mode & PERMISSION_BITS).toBe(OWNER_ONLY_MODE);
  });

  it('replaces a corrupt identity file', () => {
    writeFileSync(file, 'not json');
    const identity = loadOrCreateWebhookIdentity(file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(identity);
  });

  it('creates the parent directory when it does not exist', () => {
    const nested = join(dir, 'nested', 'identity.json');
    expect(loadOrCreateWebhookIdentity(nested)).toEqual(loadOrCreateWebhookIdentity(nested));
  });
});
