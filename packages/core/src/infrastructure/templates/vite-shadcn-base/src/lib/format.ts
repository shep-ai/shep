/**
 * Shep default formatters.
 *
 * Use these everywhere instead of hand-rolling date / currency /
 * number formatting. Consistent output across screens matters more
 * than per-screen cleverness.
 */

/**
 * Human-readable relative time for a chat-style timeline.
 *   - Under 1 minute → "just now"
 *   - Under 1 hour   → "Nm ago"
 *   - Under 1 day    → "Nh ago"
 *   - Under 7 days   → "yesterday" / "Nd ago"
 *   - Older          → "Mar 14" or "Mar 14, 2023" if different year
 */
export function formatRelativeTime(input: Date | number | string, now: Date = new Date()): string {
  const then = input instanceof Date ? input : new Date(input);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return '';

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!sameYear) fmt.year = 'numeric';
  return then.toLocaleDateString('en-US', fmt);
}

/**
 * Currency formatter. Defaults to USD; accepts any ISO currency.
 * `value` is in major units (dollars, not cents).
 */
export function formatCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

/**
 * Compact number formatter — "1.2k", "3.4M", "5.6B".
 * Perfect for follower counts, view counts, reaction counts.
 */
export function formatCompactNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
