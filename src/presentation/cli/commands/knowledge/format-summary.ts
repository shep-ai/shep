/** One line describing what a knowledge sync did, for `knowledge sync` and `source ls`. */

import type { KnowledgeSyncSummary } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';

export function formatKnowledgeSummary(summary: KnowledgeSyncSummary): string {
  return getCliI18n().t('cli:commands.knowledge.summary', {
    added: summary.added,
    updated: summary.updated,
    removed: summary.removed,
    failed: summary.failed,
  });
}
