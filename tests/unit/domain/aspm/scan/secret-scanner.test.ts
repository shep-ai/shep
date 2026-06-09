import { describe, it, expect } from 'vitest';
import { CanonicalSeverity, FindingDomain } from '@/domain/generated/output.js';
import { scanForSecrets } from '@/domain/aspm/scan/secret-scanner.js';
import { shannonEntropy } from '@/domain/aspm/scan/entropy.js';

function file(path: string, content: string) {
  return { path, content };
}

describe('shannonEntropy', () => {
  it('returns 0 for empty input', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns near zero for repeated characters', () => {
    expect(shannonEntropy('aaaaaaaaaa')).toBeCloseTo(0);
  });

  it('returns > 4.5 bits per char for a base64-shaped token', () => {
    expect(shannonEntropy('aB3kP9q1vR7tX2zN8mY6wQ4hL5jK0sD9')).toBeGreaterThan(4.5);
  });

  it('returns < 4 bits per char for typical English prose', () => {
    expect(shannonEntropy('this is a normal english sentence with words')).toBeLessThan(4.5);
  });
});

describe('scanForSecrets — per-rule positive coverage', () => {
  it('detects AWS access key IDs (AKIA prefix)', () => {
    const drafts = scanForSecrets([file('infra.ts', 'const key = "AKIAABCDEFGHIJKLMNOP";')]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      ruleId: 'secret.aws.access-key-id',
      findingDomain: FindingDomain.Secret,
      canonicalSeverity: CanonicalSeverity.Critical,
      cweId: 'CWE-798',
      locationPath: 'infra.ts',
      locationLine: 1,
      source: 'scan:secrets',
    });
  });

  it('detects GitHub personal access tokens (ghp_ prefix)', () => {
    const drafts = scanForSecrets([file('config.env', `GITHUB_TOKEN=ghp_${'a'.repeat(36)}`)]);

    expect(drafts.find((d) => d.ruleId === 'secret.github.personal-access-token')).toBeDefined();
  });

  it('detects Slack bot tokens (xoxb-)', () => {
    // gitleaks:allow — fixture for the secret-scanner detector; not a real token.
    const fixture = `const slack = "xoxb-${'1'.repeat(10)}-${'a'.repeat(16)}";`;
    const drafts = scanForSecrets([file('bot.js', fixture)]);
    expect(drafts.find((d) => d.ruleId === 'secret.slack.token')).toBeDefined();
  });

  it('detects Stripe live keys (sk_live_)', () => {
    const drafts = scanForSecrets([file('billing.ts', `sk_live_${'1'.repeat(30)}`)]);
    expect(drafts.find((d) => d.ruleId === 'secret.stripe.live-key')).toBeDefined();
  });

  it('detects Google OAuth access tokens (ya29.)', () => {
    const drafts = scanForSecrets([file('auth.json', `{"access_token":"ya29.${'a'.repeat(40)}"}`)]);
    expect(drafts.find((d) => d.ruleId === 'secret.google.oauth-access-token')).toBeDefined();
  });

  it('detects PEM-encoded private keys', () => {
    const drafts = scanForSecrets([
      file(
        'keys/id_rsa',
        '-----BEGIN OPENSSH PRIVATE KEY-----\nstuff\n-----END OPENSSH PRIVATE KEY-----'
      ),
    ]);
    expect(drafts.find((d) => d.ruleId === 'secret.private-key.openssh')).toBeDefined();
  });

  it('detects signed JWTs with a valid JOSE header', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const jwt = `${header}.${'a'.repeat(20)}.${'b'.repeat(20)}`;
    const drafts = scanForSecrets([file('config.json', `{"token":"${jwt}"}`)]);
    expect(drafts.find((d) => d.ruleId === 'secret.jwt.signed-token')).toBeDefined();
  });

  it('detects generic high-entropy KEY/SECRET/TOKEN assignments', () => {
    const drafts = scanForSecrets([
      file('secrets.env', 'STRIPE_SECRET_KEY=aB3kP9q1vR7tX2zN8mY6wQ4hL5jK0sD9'),
    ]);
    expect(drafts.find((d) => d.ruleId === 'secret.generic.high-entropy-assignment')).toBeDefined();
  });
});

describe('scanForSecrets — negative cases (no false positives)', () => {
  it('does not flag English prose without secret syntax', () => {
    const drafts = scanForSecrets([
      file('README.md', 'This project uses an API key to authenticate. See docs.'),
    ]);
    expect(drafts).toEqual([]);
  });

  it('skips the canonical AWS example access key', () => {
    const drafts = scanForSecrets([
      file('docs/example.md', 'Example access key: AKIAIOSFODNN7EXAMPLE'),
    ]);
    expect(drafts).toEqual([]);
  });

  it('does not flag low-entropy placeholder values in KEY/SECRET assignments', () => {
    const drafts = scanForSecrets([
      file('.env.sample', 'API_KEY=your-api-key-goes-here-replace-me'),
    ]);
    expect(drafts).toEqual([]);
  });

  it('does not flag base64-encoded test fixtures shorter than the threshold', () => {
    const drafts = scanForSecrets([file('test.json', '{"data": "short=="}')]);
    expect(drafts).toEqual([]);
  });

  it('does not flag JWT-shaped strings without a valid JOSE alg', () => {
    const fakeJwt = `eyJhYmM.${'x'.repeat(20)}.${'y'.repeat(20)}`;
    const drafts = scanForSecrets([file('payload.txt', fakeJwt)]);
    expect(drafts.find((d) => d.ruleId === 'secret.jwt.signed-token')).toBeUndefined();
  });
});

describe('scanForSecrets — determinism', () => {
  it('produces identical drafts on two identical runs (NFR-24)', () => {
    const input = [
      file('a.ts', 'const k = "AKIAABCDEFGHIJKLMNOP";'),
      file('b.env', `GITHUB_TOKEN=ghp_${'a'.repeat(36)}`),
    ];

    expect(scanForSecrets(input)).toEqual(scanForSecrets(input));
  });

  it('orders drafts by (file, line, rule)', () => {
    const drafts = scanForSecrets([
      file(
        'multi.txt',
        [
          'line 1 noise',
          'const k = "AKIAABCDEFGHIJKLMNOP";',
          'noise',
          `GITHUB_TOKEN=ghp_${'a'.repeat(36)}`,
        ].join('\n')
      ),
    ]);

    expect(drafts.map((d) => d.locationLine)).toEqual([2, 4]);
  });

  it('detects 12 seeded secrets across a fixture-like input set (NFR-22)', () => {
    const input = [
      file('a.env', 'AWS=AKIAABCDEFGHIJKLMNOP'),
      file('a.env', `GITHUB=ghp_${'a'.repeat(36)}`),
      file('a.env', 'SLACK=xoxb-123-abcdefghijk'),
      file('billing.ts', `sk_live_${'1'.repeat(30)}`),
      file('g.json', `ya29.${'a'.repeat(40)}`),
      file('pem.txt', '-----BEGIN RSA PRIVATE KEY-----'),
      file(
        'config.json',
        `"token":"${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
          .replace(/=+$/, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')}.${'a'.repeat(20)}.${'b'.repeat(20)}"`
      ),
      file('s1.env', 'API_KEY=aB3kP9q1vR7tX2zN8mY6wQ4hL5jK0sD9'),
      file('s2.env', 'DB_SECRET=qP8nM7vR3kX9zL2hY6bN4dC1tF5sJ8aE'),
      file('s3.env', 'AUTH_TOKEN=Z9yX2vB7nM4kQ8rT1pL6hJ3dF5sC0gW4'),
      file('s4.env', 'SESSION_PASSWORD=R8tY3uI7oP1aS5dF9gH2jK6lM4nB0vC8'),
      file('s5.env', 'OPENAI_API_KEY=sk_aB3kP9q1vR7tX2zN8mY6wQ4hL5jK0sD9'),
    ];

    expect(scanForSecrets(input)).toHaveLength(12);
  });
});
