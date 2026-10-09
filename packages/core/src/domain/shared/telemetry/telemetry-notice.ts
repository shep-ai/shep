/**
 * Fields named by the first-run telemetry notice (spec 133).
 *
 * The CLI and the web onboarding both render this list (each field is an i18n
 * key under `telemetry.notice.fields.*`), so the notice cannot drift from what
 * the envelope builder sends. Identity fields are only sent while "Include my
 * identity" is on.
 */

export const TELEMETRY_NOTICE_FIELDS = [
  'installId',
  'usage',
  'platform',
  'agentAccountHash',
  'githubUsername',
  'githubOwners',
  'contactConsent',
] as const;

export type TelemetryNoticeField = (typeof TELEMETRY_NOTICE_FIELDS)[number];

/** The subset covered by the "Include my identity" toggle. */
export const TELEMETRY_IDENTITY_FIELDS: readonly TelemetryNoticeField[] = [
  'agentAccountHash',
  'githubUsername',
  'githubOwners',
];
