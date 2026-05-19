/**
 * Unit tests for the pure-domain Redactor (feature 098, phase 3, NFR-13).
 */

import { describe, it, expect } from 'vitest';
import { redactSecrets, computeRawHash } from '@/domain/aspm/redactor/redact-secrets.js';

describe('redactSecrets', () => {
  it('returns empty result for empty input', () => {
    expect(redactSecrets('')).toEqual({ redacted: '', hits: [] });
  });

  it('leaves normal English text intact', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const result = redactSecrets(text);
    expect(result.redacted).toBe(text);
    expect(result.hits).toEqual([]);
  });

  it('leaves short identifiers and normal code intact', () => {
    const text = 'function getUserById(id: string) { return db.users.find(id); }';
    const result = redactSecrets(text);
    expect(result.redacted).toBe(text);
    expect(result.hits).toEqual([]);
  });

  it.each([
    ['aws-access-key-id', 'leaked = "AKIAIOSFODNN7EXAMPLE"'],
    ['gcp-service-account-key', 'apiKey = AIzaSyA-1234567890abcdefghijklmnopqrstu'],
    ['github-personal-access-token', 'token=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789'],
    [
      'github-fine-grained-token',
      'pat=github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDe',
    ],
    ['slack-bot-token', 'creds=xoxb-12345-67890-aBcDeFgHiJkLmN'],
    ['stripe-secret-key', 'STRIPE=sk_live_aBcDeFgHiJkLmNoPqRsTuV'],
    ['openai-api-key', 'env=sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ'],
    ['anthropic-api-key', 'env=sk-ant-aBcDeFgHiJkLmNoPqRsTuVwXyZ'],
    [
      'jwt',
      'auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2Q',
    ],
  ])('masks a %s match', (name, text) => {
    const result = redactSecrets(text);
    expect(result.hits).toContain(name);
    expect(result.redacted).toContain(`[REDACTED:${name}]`);
    // The original sensitive substring must not survive.
    const sensitive = text.slice(text.indexOf('=') + 1).trim();
    expect(result.redacted).not.toContain(sensitive);
  });

  it('masks a PEM private key block', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEpAIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const result = redactSecrets(`config = """\n${pem}\n"""`);
    expect(result.hits).toContain('pem-private-key-block');
    expect(result.redacted).not.toContain('BEGIN RSA PRIVATE KEY');
  });

  it('masks a high-entropy fallback blob ≥32 chars', () => {
    const blob = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef';
    const result = redactSecrets(`secret=${blob}`);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.redacted).not.toContain(blob);
  });

  it('does not false-positive on a 31-character lowercase word', () => {
    const word = 'a'.repeat(31);
    const result = redactSecrets(word);
    expect(result.hits).toEqual([]);
    expect(result.redacted).toBe(word);
  });

  it('reports each pattern at most once even if it matches multiple times', () => {
    const text =
      'one ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 and ghp_zZyYxXwWvVuUtTsSrRqQpPoOnNmMlLkK';
    const result = redactSecrets(text);
    expect(result.hits.filter((h) => h === 'github-personal-access-token')).toHaveLength(1);
    expect(result.redacted).not.toMatch(/ghp_[A-Za-z0-9]+/);
  });
});

describe('computeRawHash', () => {
  it('is deterministic for the same input + hasher', () => {
    const hasher = (s: string): string => `hash(${s})`;
    expect(computeRawHash('hello', hasher)).toBe(computeRawHash('hello', hasher));
    expect(computeRawHash('hello', hasher)).toBe('hash(hello)');
  });

  it('uses an injected node:crypto-style hasher', async () => {
    const { createHash } = await import('node:crypto');
    const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
    const a = computeRawHash('payload', sha256);
    const b = computeRawHash('payload', sha256);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(computeRawHash('different', sha256));
  });
});
