/**
 * Secret pattern table for the ASPM Redactor (feature 098, phase 3, NFR-13).
 *
 * Each pattern is the smallest expression that reliably matches a single
 * canonical secret shape: provider key prefixes (AWS/GCP/Azure), common
 * token prefixes (sk_, ghp_, ...), PEM headers, and a high-entropy
 * fallback for opaque base64-ish blobs.
 *
 * Patterns are pure data — the redactor walks this list to keep the
 * matching logic in one place and the rule set greppable.
 */

export interface SecretPattern {
  /** Human-readable name; surfaced in audit logs when a match fires. */
  name: string;
  /** Regex literal applied to scanner-supplied text. */
  regex: RegExp;
}

export const HIGH_ENTROPY_MIN_LENGTH = 32;

/**
 * The canonical pattern set. Each `regex` MUST be `g` (global) so the
 * redactor can run a single `replaceAll`-style pass.
 *
 * Ordering matters only when two patterns could match the same span — the
 * earlier entry wins. Provider-specific prefixes are listed first so the
 * high-entropy fallback doesn't mask their human-readable boundary.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'aws-access-key-id', regex: /\b(?:AKIA|ASIA|AGPA|AIDA)[A-Z0-9]{16}\b/g },
  {
    name: 'aws-secret-access-key',
    regex: /\baws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
  },
  { name: 'gcp-service-account-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'gcp-oauth-client-secret', regex: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/g },
  {
    name: 'azure-storage-account-key',
    regex: /\bDefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{60,}/g,
  },
  { name: 'github-personal-access-token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'github-fine-grained-token', regex: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: 'slack-bot-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'stripe-secret-key', regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'openai-api-key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'anthropic-api-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  {
    name: 'pem-private-key-block',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    name: 'high-entropy-blob',
    regex: new RegExp(`\\b[A-Za-z0-9+/_-]{${HIGH_ENTROPY_MIN_LENGTH},}={0,2}\\b`, 'g'),
  },
];
