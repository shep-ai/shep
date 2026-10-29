/**
 * Settings ⇄ row mapping for LearningConfig (spec 150, migration 174).
 *
 * Kept out of settings.mapper.ts, which is already far past the file-length
 * rule. Stored as JSON; NULL means "never configured" and reads back as
 * undefined, and every read goes through `resolveLearningConfig` so partial or
 * hand-edited JSON still yields valid, opt-in defaults.
 */

import type { LearningConfig } from '../../../../domain/generated/output.js';
import { resolveLearningConfig } from '../../../../domain/harness-learning/learning-config.js';

export interface SettingsLearningRow {
  learning_config?: string | null;
}

export function learningToRow(learning: LearningConfig | undefined): SettingsLearningRow {
  return { learning_config: learning ? JSON.stringify(learning) : null };
}

export function learningFromRow(row: SettingsLearningRow): LearningConfig | undefined {
  if (row.learning_config === null || row.learning_config === undefined) return undefined;
  try {
    return resolveLearningConfig(JSON.parse(row.learning_config) as Partial<LearningConfig>);
  } catch {
    return undefined;
  }
}
