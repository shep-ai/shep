/**
 * Shannon entropy in bits per character. Used by the SecretScanner to
 * separate base64-shaped tokens (high entropy) from English prose
 * (low entropy) when the generic high-entropy rule fires.
 *
 * A typical English word averages ~3.5–4.0 bits; cryptographic tokens
 * over base64/base62 alphabets land in the 4.5–6.0 range. We treat
 * everything ≥ 4.5 as "candidate secret" for the generic rule.
 */
export function shannonEntropy(input: string): number {
  if (input.length === 0) return 0;
  const frequency = new Map<string, number>();
  for (const ch of input) {
    frequency.set(ch, (frequency.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const length = input.length;
  for (const count of frequency.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Entropy threshold (bits/char) above which a generic candidate is flagged. */
export const GENERIC_SECRET_ENTROPY_THRESHOLD = 4.5;
