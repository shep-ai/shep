/**
 * Feedback key generator (output port) — spec 127: makes new random keys and
 * hashes presented ones, so use cases never touch crypto directly.
 */

export interface GeneratedFeedbackKey {
  /** The key itself; shown once and never stored. */
  secret: string;
  /** Its first characters, kept to recognise it. */
  prefix: string;
  hash: string;
}

export interface IFeedbackKeyGenerator {
  generate(): GeneratedFeedbackKey;
  hash(secret: string): string;
}
