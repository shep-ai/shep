/**
 * SQLite WhatsApp Thread Mapping Repository (spec 101)
 *
 * Persists thread↔target bindings in the whatsapp_thread_mappings table.
 * Pure transport of rows — no business logic lives here.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';

import type {
  IWhatsAppThreadMappingRepository,
  WhatsAppThreadMapping,
  WhatsAppThreadMappingInput,
} from '../../application/ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';
import type { WhatsAppThreadTargetKind } from '../../domain/generated/output.js';

interface WhatsAppThreadMappingRow {
  thread_id: string;
  target_kind: string;
  target_id: string;
  active: number;
  created_at: number;
  updated_at: number;
}

function toDomain(row: WhatsAppThreadMappingRow): WhatsAppThreadMapping {
  return {
    threadId: row.thread_id,
    targetKind: row.target_kind as WhatsAppThreadTargetKind,
    targetId: row.target_id,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@injectable()
export class SQLiteWhatsAppThreadMappingRepository implements IWhatsAppThreadMappingRepository {
  constructor(private readonly db: Database.Database) {}

  async upsert(input: WhatsAppThreadMappingInput): Promise<WhatsAppThreadMapping> {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO whatsapp_thread_mappings (
           thread_id, target_kind, target_id, active, created_at, updated_at
         ) VALUES (
           @thread_id, @target_kind, @target_id, 1, @now, @now
         )
         ON CONFLICT(thread_id) DO UPDATE SET
           target_kind = excluded.target_kind,
           target_id = excluded.target_id,
           active = 1,
           updated_at = excluded.updated_at`
      )
      .run({
        thread_id: input.threadId,
        target_kind: input.targetKind,
        target_id: input.targetId,
        now,
      });

    const stored = await this.findByThread(input.threadId);
    // Guaranteed present immediately after a successful upsert.
    return stored!;
  }

  async findByThread(threadId: string): Promise<WhatsAppThreadMapping | null> {
    const row = this.db
      .prepare<[string], WhatsAppThreadMappingRow>(
        `SELECT thread_id, target_kind, target_id, active, created_at, updated_at
           FROM whatsapp_thread_mappings WHERE thread_id = ?`
      )
      .get(threadId);
    return row ? toDomain(row) : null;
  }

  async findActiveByTarget(
    targetKind: WhatsAppThreadTargetKind,
    targetId: string
  ): Promise<WhatsAppThreadMapping | null> {
    const row = this.db
      .prepare<[string, string], WhatsAppThreadMappingRow>(
        `SELECT thread_id, target_kind, target_id, active, created_at, updated_at
           FROM whatsapp_thread_mappings
          WHERE target_kind = ? AND target_id = ? AND active = 1
          ORDER BY updated_at DESC
          LIMIT 1`
      )
      .get(targetKind, targetId);
    return row ? toDomain(row) : null;
  }

  async deactivate(threadId: string): Promise<void> {
    this.db
      .prepare('UPDATE whatsapp_thread_mappings SET active = 0, updated_at = ? WHERE thread_id = ?')
      .run(Date.now(), threadId);
  }
}
