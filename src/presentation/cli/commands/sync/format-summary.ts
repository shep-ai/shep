/** One line describing what a sync run did, for `shep sync run` and `rule ls`. */

import type { TrackerSyncRunSummary } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';

export function formatRunSummary(summary: TrackerSyncRunSummary): string {
  return getCliI18n().t('cli:commands.sync.summary', {
    created: summary.created,
    updated: summary.updated,
    pushed: summary.pushed,
    conflicts: summary.conflicts,
    failed: summary.failed,
  });
}
