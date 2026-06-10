/**
 * Migration 056: Persist MessagingConfig on the settings table
 *
 * Feature 082 (messaging remote control) added `MessagingConfig` to the domain
 * model but the persistence layer was never extended, so every pairing was
 * silently dropped on write. This migration backfills the missing columns.
 *
 * Backward compatibility:
 *   - Every column is nullable (or has a safe default of 0) so existing rows
 *     from main keep working untouched.
 *   - Reading code treats nulls as "not configured", matching the pre-feature
 *     behaviour where `settings.messaging` was undefined.
 *   - The mapper round-trips values: a row written by an older build (all
 *     nulls) decodes to `{ enabled: false, debounceMs: 5000, chatBufferMs: 3000 }`,
 *     which is exactly the fallback the in-memory code already uses.
 *   - This migration is idempotent via PRAGMA table_info guard.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

interface ColumnSpec {
  name: string;
  ddl: string;
}

const COLUMNS: ColumnSpec[] = [
  // Top-level MessagingConfig fields
  { name: 'messaging_enabled', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'messaging_gateway_url', ddl: 'TEXT' },
  { name: 'messaging_device_id', ddl: 'TEXT' },
  { name: 'messaging_gateway_client_id', ddl: 'TEXT' },
  { name: 'messaging_debounce_ms', ddl: 'INTEGER' },
  { name: 'messaging_chat_buffer_ms', ddl: 'INTEGER' },

  // Per-platform: Telegram
  { name: 'messaging_telegram_enabled', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'messaging_telegram_paired', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'messaging_telegram_chat_id', ddl: 'TEXT' },
  { name: 'messaging_telegram_route_id', ddl: 'TEXT' },
  { name: 'messaging_telegram_route_token', ddl: 'TEXT' },
  { name: 'messaging_telegram_public_url', ddl: 'TEXT' },
  { name: 'messaging_telegram_bot_token', ddl: 'TEXT' },
  { name: 'messaging_telegram_pending_code', ddl: 'TEXT' },
  { name: 'messaging_telegram_pending_expires_at', ddl: 'TEXT' },

  // Per-platform: WhatsApp
  { name: 'messaging_whatsapp_enabled', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'messaging_whatsapp_paired', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'messaging_whatsapp_chat_id', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_route_id', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_route_token', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_public_url', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_bot_token', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_pending_code', ddl: 'TEXT' },
  { name: 'messaging_whatsapp_pending_expires_at', ddl: 'TEXT' },
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = db.pragma('table_info(settings)') as { name: string }[];
  const present = new Set(existing.map((c) => c.name));

  for (const col of COLUMNS) {
    if (!present.has(col.name)) {
      db.exec(`ALTER TABLE settings ADD COLUMN ${col.name} ${col.ddl}`);
    }
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite ALTER TABLE DROP COLUMN was only added in 3.35. We leave the
  // columns in place on rollback — they are harmless nullable additions
  // and removing them would require a full table rebuild. This matches
  // the pattern used by earlier migrations in this repo.
  void db;
}
