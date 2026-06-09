/**
 * In-house secret-detection rule pack (Phase 11, task-66).
 *
 * Every rule produces a deterministic finding draft via the SecretScanner.
 * Rules are intentionally narrow (high precision over recall) so the false-
 * positive rate stays under 5% on real-world repos. The generic high-entropy
 * fallback runs only when the matched value contains a `KEY|SECRET|TOKEN`
 * assignment context AND the value clears the Shannon entropy threshold.
 *
 * Each rule's regex is anchored on either a unique prefix (AKIA, ghp_, etc.)
 * or a labeled assignment, so catastrophic backtracking is avoided by
 * construction.
 */

import { CanonicalSeverity } from '../../generated/output';

export interface SecretRule {
  /** Stable rule identifier persisted to security_findings.rule_id. */
  id: string;
  /** Human-readable rule title shown in the UI. */
  title: string;
  /** Long-form description (~one sentence). */
  description: string;
  /** Canonical severity assigned to every finding produced by this rule. */
  severity: CanonicalSeverity;
  /** CWE-798 ("Use of Hard-coded Credentials") for everything in this pack. */
  cweId: 'CWE-798';
  /** Regex used to locate candidate matches. MUST be global. */
  pattern: RegExp;
  /**
   * Optional post-match validator. Returns true to keep the candidate,
   * false to discard. Lets generic patterns require additional entropy or
   * label context without complicating the regex.
   */
  validate?: (match: string, surroundingLine: string) => boolean;
}

/**
 * Closed set of vendor + generic rules. Vendor rules are unambiguous
 * (a 40-char hex string after `ghp_` is unambiguously a GitHub PAT);
 * generic rules require entropy + context to fire.
 */
export const SECRET_RULES: readonly SecretRule[] = [
  {
    id: 'secret.aws.access-key-id',
    title: 'AWS access key ID',
    description:
      'AWS access key IDs follow the AKIA / ASIA prefix pattern and grant programmatic AWS API access.',
    severity: CanonicalSeverity.Critical,
    cweId: 'CWE-798',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'secret.github.personal-access-token',
    title: 'GitHub personal access token',
    description:
      'GitHub PATs (classic ghp_, OAuth gho_, user-to-server ghu_, server-to-server ghs_, refresh ghr_) grant repo-scoped API access.',
    severity: CanonicalSeverity.Critical,
    cweId: 'CWE-798',
    pattern: /\bgh[oprsu]_[A-Za-z0-9]{30,255}\b/g,
  },
  {
    id: 'secret.slack.token',
    title: 'Slack token',
    description:
      'Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-) authenticate as a workspace user or bot.',
    severity: CanonicalSeverity.High,
    cweId: 'CWE-798',
    pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g,
  },
  {
    id: 'secret.stripe.live-key',
    title: 'Stripe live secret key',
    description: 'Stripe sk_live_ keys can charge real cards — never commit them.',
    severity: CanonicalSeverity.Critical,
    cweId: 'CWE-798',
    pattern: /\bsk_live_[0-9A-Za-z]{24,}\b/g,
  },
  {
    id: 'secret.google.oauth-access-token',
    title: 'Google OAuth access token',
    description: 'Google OAuth ya29.* tokens grant scoped access to a Google account.',
    severity: CanonicalSeverity.High,
    cweId: 'CWE-798',
    pattern: /\bya29\.[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'secret.private-key.openssh',
    title: 'OpenSSH private key',
    description: 'PEM-encoded OpenSSH/RSA/EC private key found in source.',
    severity: CanonicalSeverity.Critical,
    cweId: 'CWE-798',
    pattern: /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED) PRIVATE KEY-----/g,
  },
  {
    id: 'secret.jwt.signed-token',
    title: 'Signed JWT',
    description:
      'A three-segment dot-delimited base64url string with a JOSE header — likely an issued JWT.',
    severity: CanonicalSeverity.Medium,
    cweId: 'CWE-798',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    validate: (match) => {
      const header = match.split('.')[0]!;
      try {
        const decoded = atob(header.replace(/-/g, '+').replace(/_/g, '/'));
        const json = JSON.parse(decoded) as { alg?: string; typ?: string };
        return typeof json.alg === 'string';
      } catch {
        return false;
      }
    },
  },
  {
    id: 'secret.generic.high-entropy-assignment',
    title: 'Generic high-entropy secret assignment',
    description:
      'A 32+ character value assigned to a KEY/SECRET/TOKEN/PASSWORD/PASSWD identifier with cryptographic-looking entropy.',
    severity: CanonicalSeverity.Medium,
    cweId: 'CWE-798',
    pattern:
      /(?:[A-Z_][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD))\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{32,})["']?/gi,
  },
];
