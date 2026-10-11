/**
 * Settings ⇄ row mapping for TelemetryConfig (migration 168, spec 133).
 *
 * Kept out of settings.mapper.ts, which is already far past the file-length
 * rule. Missing values fall back to DEFAULT_TELEMETRY_PREFERENCES (metrics on,
 * identity and contact consent off), and the migration's column defaults match.
 */

import type { TelemetryConfig } from '../../../../domain/generated/output.js';
import { DEFAULT_TELEMETRY_PREFERENCES } from '../../../../domain/shared/telemetry/telemetry-state.js';

const toFlag = (value: boolean): number => (value ? 1 : 0);
const fromFlag = (value: number | null | undefined, fallback: boolean): boolean =>
  value === null || value === undefined ? fallback : value !== 0;

export interface SettingsTelemetryRow {
  telemetry_enabled: number;
  telemetry_include_identity: number;
  telemetry_contact_consent: number;
  telemetry_install_id: string | null;
  telemetry_notice_shown_at: string | null;
  telemetry_last_heartbeat_at: string | null;
}

/** Column names, for the repository's INSERT and UPDATE lists. */
export const SETTINGS_TELEMETRY_COLUMNS: readonly (keyof SettingsTelemetryRow)[] = [
  'telemetry_enabled',
  'telemetry_include_identity',
  'telemetry_contact_consent',
  'telemetry_install_id',
  'telemetry_notice_shown_at',
  'telemetry_last_heartbeat_at',
];

function toIso(value: Date | string | undefined): string | null {
  if (value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function telemetryToRow(telemetry: TelemetryConfig | undefined): SettingsTelemetryRow {
  return {
    telemetry_enabled: toFlag(telemetry?.enabled ?? DEFAULT_TELEMETRY_PREFERENCES.enabled),
    telemetry_include_identity: toFlag(
      telemetry?.includeIdentity ?? DEFAULT_TELEMETRY_PREFERENCES.includeIdentity
    ),
    telemetry_contact_consent: toFlag(
      telemetry?.contactConsent ?? DEFAULT_TELEMETRY_PREFERENCES.contactConsent
    ),
    telemetry_install_id: telemetry?.installId ?? null,
    telemetry_notice_shown_at: toIso(telemetry?.noticeShownAt),
    telemetry_last_heartbeat_at: toIso(telemetry?.lastHeartbeatAt),
  };
}

export function telemetryFromRow(row: Partial<SettingsTelemetryRow>): TelemetryConfig {
  return {
    enabled: fromFlag(row.telemetry_enabled, DEFAULT_TELEMETRY_PREFERENCES.enabled),
    includeIdentity: fromFlag(
      row.telemetry_include_identity,
      DEFAULT_TELEMETRY_PREFERENCES.includeIdentity
    ),
    contactConsent: fromFlag(
      row.telemetry_contact_consent,
      DEFAULT_TELEMETRY_PREFERENCES.contactConsent
    ),
    ...(row.telemetry_install_id ? { installId: row.telemetry_install_id } : {}),
    ...(row.telemetry_notice_shown_at
      ? { noticeShownAt: new Date(row.telemetry_notice_shown_at) }
      : {}),
    ...(row.telemetry_last_heartbeat_at
      ? { lastHeartbeatAt: new Date(row.telemetry_last_heartbeat_at) }
      : {}),
  };
}
