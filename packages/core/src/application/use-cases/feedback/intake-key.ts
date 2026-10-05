/**
 * Intake keys (specs 127, 129): the space keys tools post with, shared by the
 * feedback and alert endpoints, and the field checks both payloads use.
 */

import type { FeedbackKey } from '../../../domain/generated/output.js';
import { optionalText } from '../../../domain/shared/defined.js';
import type { IFeedbackKeyRepository } from '../../ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../ports/output/services/feedback-key-generator.interface.js';

export const MAX_FIELD_LENGTH = 500;
export const MAX_DETAIL_LENGTH = 5_000;
const HTTP_URL = /^https?:\/\//i;

/** The active key a secret belongs to, or null for a missing, unknown or revoked one. */
export async function verifyIntakeKey(
  keys: IFeedbackKeyRepository,
  generator: IFeedbackKeyGenerator,
  secret: string
): Promise<FeedbackKey | null> {
  if (!secret) return null;
  const key = await keys.findByHash(generator.hash(secret));
  return key && !key.revokedAt ? key : null;
}

export async function markIntakeKeyUsed(
  keys: IFeedbackKeyRepository,
  key: FeedbackKey
): Promise<void> {
  const now = new Date();
  await keys.update({ ...key, lastUsedAt: now, updatedAt: now });
}

/** Trimmed text; undefined when absent or blank; null when not a string or longer than `max`. */
export function payloadText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) return null;
  return optionalText(value);
}

/** Whether an optional link is an http(s) URL. */
export function isHttpLink(url: string | undefined): boolean {
  return url === undefined || HTTP_URL.test(url);
}
