/**
 * Fields named by the first-run telemetry notice (spec 133).
 *
 * The CLI and the web onboarding both render these lists (each field is an
 * i18n key under `telemetry.notice.fields.*`), so the notice cannot drift from
 * what the envelope builder sends. Identity is opt-in: its fields are sent
 * only after the user turns "Include my identity" on, so the notice lists them
 * apart from what is always sent.
 */

/** Sent with every event while usage metrics are on. */
export const TELEMETRY_ANONYMOUS_FIELDS = [
  'installId',
  'usage',
  'platform',
  'contactConsent',
] as const;

/** Sent only while "Include my identity" is on (off by default). */
export const TELEMETRY_IDENTITY_FIELDS = [
  'agentAccountHash',
  'githubUsername',
  'githubOwners',
] as const;

/** Every field usage metrics can send. */
export const TELEMETRY_NOTICE_FIELDS = [
  ...TELEMETRY_ANONYMOUS_FIELDS,
  ...TELEMETRY_IDENTITY_FIELDS,
] as const;

export type TelemetryNoticeField = (typeof TELEMETRY_NOTICE_FIELDS)[number];
