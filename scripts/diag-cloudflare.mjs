/* global process, console, fetch */

/**
 * Diagnostic script — exercises every Cloudflare endpoint the
 * CloudflarePagesProvider hits, using the SAME token shep already has
 * stored. Dumps the raw response (status, content-type, first 1KB of
 * body) so we can see exactly what Cloudflare returns and confirm there's
 * no edge-error / non-JSON / project-spam happening.
 *
 * Usage:  node scripts/diag-cloudflare.mjs [projectName]
 *
 * NEVER prints the token. Reads it from ~/.shep/data via
 * cloud_provider_tokens + secret.key (LocalSecretBox AES-GCM).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createDecipheriv } from 'node:crypto';
import Database from 'better-sqlite3';

const SHEP_HOME = process.env.SHEP_HOME || join(homedir(), '.shep');
const DB_PATH = join(SHEP_HOME, 'data');
const KEY_PATH = join(SHEP_HOME, 'secret.key');

const KEY = readFileSync(KEY_PATH);
if (KEY.length !== 32) throw new Error(`secret.key wrong length: ${KEY.length}`);

const db = new Database(DB_PATH, { readonly: true });
const row = db
  .prepare(
    'SELECT token_ciphertext, token_iv, token_tag FROM cloud_provider_tokens WHERE provider = ?'
  )
  .get('CloudflarePages');
if (!row) {
  console.error('no Cloudflare token stored in shep db');
  process.exit(2);
}

function decrypt(ciphertext, iv, tag) {
  const d = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  return d.update(ciphertext, undefined, 'utf8') + d.final('utf8');
}
const TOKEN = decrypt(row.token_ciphertext, row.token_iv, row.token_tag);
console.log(`token decrypted: ${TOKEN.length} chars (first 4: ${TOKEN.slice(0, 4)}…)`);

const BASE = 'https://api.cloudflare.com/client/v4';
const PROJECT_NAME = process.argv[2] || 'landing-page-hero-features-pricing-85f4e3';

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  console.log(`\n── ${method} ${path}  →  HTTP ${res.status}  [${ct.split(';')[0] || '<no ct>'}]`);
  console.log(`   body[:1024] = ${text.slice(0, 1024)}`);
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      console.log('   ! JSON parse failed');
      return null;
    }
  }
  return null;
}

// 1. verify token
const v = await call('GET', '/user/tokens/verify');
console.log(`   parsed: success=${v?.success}  status=${v?.result?.status}`);

// 2. list accounts
const a = await call('GET', '/accounts');
const accountId = a?.result?.[0]?.id;
console.log(
  `   parsed: success=${a?.success}  account_count=${a?.result?.length}  first.id=${accountId ?? '<none>'}`
);
if (!accountId) {
  console.error('no account → cannot continue');
  process.exit(3);
}

// 3. list pages projects (this is the "are we spamming new projects?" check)
const p = await call('GET', `/accounts/${accountId}/pages/projects`);
console.log(`   parsed: success=${p?.success}  project_count=${p?.result?.length ?? 0}`);
if (Array.isArray(p?.result)) {
  for (const proj of p.result) {
    console.log(
      `     • ${proj.name}  subdomain=${proj.subdomain ?? '?'}  created=${proj.created_on ?? '?'}`
    );
  }
}

// 4. show deployments for the project we care about
console.log(`\n── Deployments for project: ${PROJECT_NAME}`);
const d = await call('GET', `/accounts/${accountId}/pages/projects/${PROJECT_NAME}/deployments`);
if (d?.result && Array.isArray(d.result)) {
  console.log(`   ${d.result.length} deployment(s):`);
  for (const dep of d.result.slice(0, 10)) {
    const stage = dep.latest_stage?.status ?? '?';
    console.log(
      `     • ${dep.id}  stage=${stage}  url=${dep.url ?? '?'}  created=${dep.created_on ?? '?'}`
    );
  }
}

console.log('\ndone.');
