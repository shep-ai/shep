/**
 * SQLite SupervisorPolicy Repository (spec 093)
 *
 * Backed by the supervisor_policies table. Uniqueness is enforced at the
 * schema layer via the unique-(scope_type, scope_id, COALESCE(feature_id, ''))
 * index. {@link findPolicyForScope} implements the documented feature->scope
 * fallback (research decision 7).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { ISupervisorPolicyRepository } from '../../application/ports/output/repositories/supervisor-policy-repository.interface.js';
import type { SupervisorPolicy } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type SupervisorPolicyRow,
} from '../persistence/sqlite/mappers/supervisor-policy.mapper.js';

@injectable()
export class SQLiteSupervisorPolicyRepository implements ISupervisorPolicyRepository {
  constructor(private readonly db: Database.Database) {}

  async create(policy: SupervisorPolicy): Promise<void> {
    const row = toDatabase(policy);
    const stmt = this.db.prepare(`
      INSERT INTO supervisor_policies (
        id, scope_type, scope_id, feature_id, enabled, autonomy_level,
        gate_authority_json, model_id, prompt_version,
        policy_rules_json, guardrail_rules_json, notification_overrides_json,
        created_at, updated_at
      ) VALUES (
        @id, @scope_type, @scope_id, @feature_id, @enabled, @autonomy_level,
        @gate_authority_json, @model_id, @prompt_version,
        @policy_rules_json, @guardrail_rules_json, @notification_overrides_json,
        @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async update(policy: SupervisorPolicy): Promise<void> {
    const row = toDatabase(policy);
    const stmt = this.db.prepare(`
      UPDATE supervisor_policies SET
        scope_type = @scope_type,
        scope_id = @scope_id,
        feature_id = @feature_id,
        enabled = @enabled,
        autonomy_level = @autonomy_level,
        gate_authority_json = @gate_authority_json,
        model_id = @model_id,
        prompt_version = @prompt_version,
        policy_rules_json = @policy_rules_json,
        guardrail_rules_json = @guardrail_rules_json,
        notification_overrides_json = @notification_overrides_json,
        updated_at = @updated_at
      WHERE id = @id
    `);
    stmt.run(row);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM supervisor_policies WHERE id = ?').run(id);
  }

  async findById(id: string): Promise<SupervisorPolicy | null> {
    const row = this.db.prepare('SELECT * FROM supervisor_policies WHERE id = ?').get(id) as
      | SupervisorPolicyRow
      | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByScope(scopeType: string, scopeId?: string): Promise<SupervisorPolicy | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM supervisor_policies
         WHERE scope_type = ? AND COALESCE(scope_id, '') = COALESCE(?, '')
           AND feature_id IS NULL
         LIMIT 1`
      )
      .get(scopeType, scopeId ?? null) as SupervisorPolicyRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByScopeAndFeature(
    scopeType: string,
    scopeId: string | undefined,
    featureId: string
  ): Promise<SupervisorPolicy | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM supervisor_policies
         WHERE scope_type = ? AND COALESCE(scope_id, '') = COALESCE(?, '')
           AND feature_id = ?
         LIMIT 1`
      )
      .get(scopeType, scopeId ?? null, featureId) as SupervisorPolicyRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findPolicyForScope(
    scopeType: string,
    scopeId: string | undefined,
    featureId: string | undefined
  ): Promise<SupervisorPolicy | null> {
    if (featureId !== undefined) {
      const featureRow = await this.findByScopeAndFeature(scopeType, scopeId, featureId);
      if (featureRow) return featureRow;
    }
    return this.findByScope(scopeType, scopeId);
  }

  async listByScope(scopeType: string, scopeId?: string): Promise<SupervisorPolicy[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM supervisor_policies
         WHERE scope_type = ? AND COALESCE(scope_id, '') = COALESCE(?, '')
         ORDER BY feature_id IS NULL DESC, feature_id ASC`
      )
      .all(scopeType, scopeId ?? null) as SupervisorPolicyRow[];
    return rows.map(fromDatabase);
  }

  async listAll(): Promise<SupervisorPolicy[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM supervisor_policies
         ORDER BY scope_type ASC,
                  scope_id IS NULL DESC, scope_id ASC,
                  feature_id IS NULL DESC, feature_id ASC`
      )
      .all() as SupervisorPolicyRow[];
    return rows.map(fromDatabase);
  }
}
