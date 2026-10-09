/**
 * Settings ⇄ row mapping for TelemetryConfig (migration 166, spec 133).
 *
 * Kept out of settings.mapper.ts, which is already far past the file-length
 * rule. Rows written before migration 166 read back as the defaults (on, with
 * identity, no contact consent) because the columns default that way.
 */

import type { TelemetryConfig } from '../../../../domain/generated/output.js';

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
    telemetry_enabled: (telemetry?.enabled ?? true) ? 1 : 0,
    telemetry_include_identity: (telemetry?.includeIdentity ?? true) ? 1 : 0,
    telemetry_contact_consent: telemetry?.contactConsent ? 1 : 0,
    telemetry_install_id: telemetry?.installId ?? null,
    telemetry_notice_shown_at: toIso(telemetry?.noticeShownAt),
    telemetry_last_heartbeat_at: toIso(telemetry?.lastHeartbeatAt),
  };
}

export function telemetryFromRow(row: Partial<SettingsTelemetryRow>): TelemetryConfig {
  return {
    enabled: (row.telemetry_enabled ?? 1) !== 0,
    includeIdentity: (row.telemetry_include_identity ?? 1) !== 0,
    contactConsent: row.telemetry_contact_consent === 1,
    ...(row.telemetry_install_id ? { installId: row.telemetry_install_id } : {}),
    ...(row.telemetry_notice_shown_at
      ? { noticeShownAt: new Date(row.telemetry_notice_shown_at) }
      : {}),
    ...(row.telemetry_last_heartbeat_at
      ? { lastHeartbeatAt: new Date(row.telemetry_last_heartbeat_at) }
      : {}),
  };
}
