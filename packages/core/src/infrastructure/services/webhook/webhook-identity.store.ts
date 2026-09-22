/**
 * Webhook Identity Store
 *
 * Persists the identity a Shep installation uses for its GitHub webhooks:
 *
 *   - `secret`     — the HMAC secret GitHub signs deliveries with. It must be
 *                    stable across daemon restarts, or every hook created by a
 *                    previous run fails signature validation.
 *   - `instanceId` — tagged onto every hook URL this installation creates
 *                    (`?shep_instance=<id>`), so stale-hook cleanup deletes
 *                    only this installation's hooks and never those of another
 *                    Shep running against the same repository (another
 *                    machine, or dev next to prod).
 *
 * The file is created with O_EXCL so two daemons sharing one SHEP_HOME agree
 * on a single identity, and is readable by the owner only.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const WEBHOOK_IDENTITY_FILENAME = 'github-webhook-identity.json';
/** Query parameter carrying the owning installation's id on every hook URL. */
export const WEBHOOK_INSTANCE_QUERY_PARAM = 'shep_instance';

const SECRET_BYTES = 32;
const OWNER_ONLY_MODE = 0o600;
const EXCLUSIVE_CREATE_FLAG = 'wx';

export interface WebhookInstanceIdentity {
  instanceId: string;
  secret: string;
}

export function createWebhookIdentity(): WebhookInstanceIdentity {
  return { instanceId: randomUUID(), secret: randomBytes(SECRET_BYTES).toString('hex') };
}

function readIdentity(filePath: string): WebhookInstanceIdentity | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<WebhookInstanceIdentity>;
    if (typeof parsed.instanceId === 'string' && typeof parsed.secret === 'string') {
      return { instanceId: parsed.instanceId, secret: parsed.secret };
    }
  } catch {
    // Missing or corrupt — fall through to (re)create.
  }
  return null;
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EEXIST';
}

/** Load the persisted identity, creating it on first use (or if corrupt). */
export function loadOrCreateWebhookIdentity(filePath: string): WebhookInstanceIdentity {
  const existing = readIdentity(filePath);
  if (existing) return existing;

  mkdirSync(dirname(filePath), { recursive: true });
  const fresh = createWebhookIdentity();
  const contents = JSON.stringify(fresh);
  try {
    writeFileSync(filePath, contents, { flag: EXCLUSIVE_CREATE_FLAG, mode: OWNER_ONLY_MODE });
    return fresh;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }

  // Another process created it first — adopt theirs; a corrupt file is replaced.
  const winner = readIdentity(filePath);
  if (winner) return winner;
  writeFileSync(filePath, contents, { mode: OWNER_ONLY_MODE });
  return fresh;
}
