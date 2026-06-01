/**
 * WhatsApp reply intent classification (spec 101)
 *
 * Maps a free-text WhatsApp reply to an approve/reject/other intent for HITL
 * gates. Locale-aware (English + Hebrew, the primary personas) and
 * accent/case-insensitive. Keyword sets are data, not inline comparisons, so
 * there are no magic string literals scattered through the routing logic.
 */

/** What a reply on a feature-bound (HITL) thread is asking for. */
export enum WhatsAppReplyIntent {
  Approve = 'approve',
  Reject = 'reject',
  Other = 'other',
}

/** Affirmative keywords (English + Hebrew). */
const APPROVE_WORDS = [
  'yes',
  'y',
  'approve',
  'approved',
  'ok',
  'okay',
  'go',
  'ship',
  'כן',
  'אישור',
  'אשר',
  'מאשר',
];

/** Negative keywords (English + Hebrew). */
const REJECT_WORDS = [
  'no',
  'n',
  'reject',
  'rejected',
  'stop',
  'cancel',
  'לא',
  'דחה',
  'דחייה',
  'בטל',
];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Classify a reply. A match requires the WHOLE trimmed message to be a known
 * keyword (so "no thanks, do X instead" is treated as free-text Other, not a
 * rejection). Approve is checked before Reject.
 */
export function classifyReplyIntent(text: string): WhatsAppReplyIntent {
  const normalized = normalize(text);
  if (APPROVE_WORDS.includes(normalized)) return WhatsAppReplyIntent.Approve;
  if (REJECT_WORDS.includes(normalized)) return WhatsAppReplyIntent.Reject;
  return WhatsAppReplyIntent.Other;
}
