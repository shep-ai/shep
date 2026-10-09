/**
 * Migration 166: structured decisions on agent questions (spec 134).
 *
 * - agent_questions.decision_json: JSON Decision (questions + options) every
 *   surface renders.
 * - agent_questions.responses_json: JSON DecisionResponse[] recorded with the
 *   answer.
 *
 * Additive and idempotent; rows written before it keep a NULL decision and are
 * rendered from options_json.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'agent_questions', 'decision_json', 'TEXT');
  addColumn(db, 'agent_questions', 'responses_json', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: nullable columns are harmless to an older build.
}
