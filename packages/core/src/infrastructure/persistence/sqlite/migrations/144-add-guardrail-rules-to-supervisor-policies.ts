/**
 * Migration 144: Add the deterministic guardrail rule set to supervisor policies.
 *
 * Backs `SupervisorPolicy.guardrailRulesJson` (spec 111). The column follows the
 * existing JSON-column convention on this table (`gate_authority_json`,
 * `policy_rules_json`, `notification_overrides_json`): a JSON array of
 * {@link GuardrailRule} objects evaluated in pure TypeScript *before* the
 * supervisor's LLM evaluator runs.
 *
 * NULL — the default for every existing row — means "no guardrails configured",
 * so this migration changes no behaviour on its own and the LLM path is reached
 * exactly as it is today.
 *
 * Additive only and guarded by PRAGMA so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(supervisor_policies)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('guardrail_rules_json')) {
    db.exec('ALTER TABLE supervisor_policies ADD COLUMN guardrail_rules_json TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
