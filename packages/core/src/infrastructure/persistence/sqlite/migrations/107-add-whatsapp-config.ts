/**
 * Migration 107: Add WhatsApp integration columns to the settings table (spec 101).
 *
 * Adds:
 *   - feature_flag_whatsapp_dispatch (INTEGER 0/1, default 0) — gates the whole
 *     WhatsApp surface; off by default (opt-in).
 *   - whatsapp_enabled (INTEGER 0/1, default 0)
 *   - whatsapp_adapter (TEXT, default 'baileys') — WhatsAppAdapterKind
 *   - whatsapp_linked_number (TEXT, nullable) — E.164
 *   - whatsapp_status (TEXT, nullable) — WhatsAppConnectionStatus
 *   - whatsapp_allowed_numbers (TEXT, nullable) — JSON array of E.164 strings
 *   - whatsapp_cloud_api_phone_number_id (TEXT, nullable)
 *   - whatsapp_cloud_api_access_token (TEXT, nullable)
 *   - whatsapp_cloud_api_verify_token (TEXT, nullable)
 *   - whatsapp_cloud_api_app_secret (TEXT, nullable)
 *
 * Additive only — no drops or renames (backward-compat migration rule). Each
 * ALTER is guarded by `pragma table_info` so the migration is idempotent.
 *
 * `down()` is a no-op (matches the no-rollback convention of every other
 * settings-column migration in this project).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  const addColumn = (name: string, ddl: string): void => {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE settings ADD COLUMN ${ddl}`);
    }
  };

  addColumn(
    'feature_flag_whatsapp_dispatch',
    'feature_flag_whatsapp_dispatch INTEGER NOT NULL DEFAULT 0'
  );
  addColumn('whatsapp_enabled', 'whatsapp_enabled INTEGER NOT NULL DEFAULT 0');
  addColumn('whatsapp_adapter', "whatsapp_adapter TEXT NOT NULL DEFAULT 'baileys'");
  addColumn('whatsapp_linked_number', 'whatsapp_linked_number TEXT');
  addColumn('whatsapp_status', 'whatsapp_status TEXT');
  addColumn('whatsapp_allowed_numbers', 'whatsapp_allowed_numbers TEXT');
  addColumn('whatsapp_cloud_api_phone_number_id', 'whatsapp_cloud_api_phone_number_id TEXT');
  addColumn('whatsapp_cloud_api_access_token', 'whatsapp_cloud_api_access_token TEXT');
  addColumn('whatsapp_cloud_api_verify_token', 'whatsapp_cloud_api_verify_token TEXT');
  addColumn('whatsapp_cloud_api_app_secret', 'whatsapp_cloud_api_app_secret TEXT');
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
