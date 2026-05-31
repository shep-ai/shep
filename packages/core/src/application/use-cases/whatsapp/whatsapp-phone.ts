/**
 * WhatsApp phone-number helpers (spec 101)
 *
 * Authorization is security-first: only numbers explicitly listed in
 * WhatsAppConfig.allowedNumbers may dispatch tasks. Comparison is done on
 * digits only so "+972 50-000-0000" and "972500000000" match.
 */

import type { WhatsAppConfig } from '../../../domain/generated/output.js';

/** Reduce a phone string to its digits for stable comparison. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Whether a sender is authorized to dispatch tasks to this shep instance.
 * Requires the integration to be enabled and the sender to appear in
 * allowedNumbers. An empty/absent allow-list authorizes no one (secure default).
 */
export function isAuthorizedSender(from: string, config: WhatsAppConfig | undefined): boolean {
  if (!config?.enabled) return false;
  const allowed = config.allowedNumbers;
  if (!allowed || allowed.length === 0) return false;
  const target = normalizePhone(from);
  if (target.length === 0) return false;
  return allowed.some((n) => normalizePhone(n) === target);
}
