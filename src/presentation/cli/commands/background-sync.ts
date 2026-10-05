/**
 * The background sync every long-running shep web process keeps going —
 * the `shep start` daemon (`_serve`) and `shep ui` alike:
 *
 * - data retention (spec 116)
 * - Linear and Jira sync rules (spec 122)
 * - Notion knowledge sources (spec 125)
 * - scheduled discovery runs (spec 128)
 * - PR and CI status of features in review
 * - PR review comments (spec 124)
 * - shipped opportunities and their outcomes (spec 130)
 *
 * PR status sync takes a cross-process lock, so running both processes at
 * once is safe.
 */

import { container } from '@/infrastructure/di/container.js';
import { RetentionScheduler } from '@/infrastructure/services/maintenance/retention-scheduler.js';
import { createDueWorkWatcher } from '@/infrastructure/services/scheduling/due-work-watcher.js';
import { createPrCommentWatcher } from '@/infrastructure/services/pr-sync/pr-comment-watcher.js';
import { createOutcomeWatcher } from '@/infrastructure/services/scheduling/outcome-watcher.js';
import {
  getPrSyncWatcher,
  initializePrSyncWatcher,
} from '@/infrastructure/services/pr-sync/pr-sync-watcher.service.js';
import { getExistingConnection } from '@/infrastructure/persistence/sqlite/connection.js';
import { PruneRetainedDataUseCase } from '@/application/use-cases/maintenance/prune-retained-data.use-case.js';
import type { SyncTrackerRulesUseCase } from '@/application/use-cases/trackers/sync-tracker-rules.use-case.js';
import type { SyncKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/sync-knowledge-sources.use-case.js';
import type { SyncDiscoveryUseCase } from '@/application/use-cases/discovery/sync-discovery.use-case.js';
import type { SyncPrCommentsUseCase } from '@/application/use-cases/pr-comments/sync-pr-comments.use-case.js';
import type { TrackOutcomesUseCase } from '@/application/use-cases/outcomes/track-outcomes.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';

export interface BackgroundSync {
  stop(): void;
}

/** Starts the background sync; `label` prefixes errors written to stderr. */
export function startBackgroundSync(label: string): BackgroundSync {
  const report = (what: string) => (error: unknown) =>
    process.stderr.write(`[${label}] ${what} failed: ${String(error)}\n`);

  const retention = new RetentionScheduler(
    () => container.resolve(PruneRetainedDataUseCase).execute(),
    report('data retention prune')
  );
  const trackers = createDueWorkWatcher(
    (now) => container.resolve<SyncTrackerRulesUseCase>('SyncTrackerRulesUseCase').runDue(now),
    report('tracker sync')
  );
  const knowledge = createDueWorkWatcher(
    (now) =>
      container.resolve<SyncKnowledgeSourcesUseCase>('SyncKnowledgeSourcesUseCase').runDue(now),
    report('knowledge sync')
  );
  const discovery = createDueWorkWatcher(
    (now) => container.resolve<SyncDiscoveryUseCase>('SyncDiscoveryUseCase').runDue(now),
    report('discovery')
  );
  const prComments = createPrCommentWatcher(
    () => container.resolve<SyncPrCommentsUseCase>('SyncPrCommentsUseCase').runDue(),
    report('PR comment sync')
  );
  const outcomes = createOutcomeWatcher(
    () => container.resolve<TrackOutcomesUseCase>('TrackOutcomesUseCase').run(),
    report('outcome tracking')
  );
  initializePrSyncWatcher(
    container.resolve<IFeatureRepository>('IFeatureRepository'),
    container.resolve<IAgentRunRepository>('IAgentRunRepository'),
    container.resolve<IGitPrService>('IGitPrService'),
    container.resolve<INotificationService>('INotificationService'),
    undefined,
    getExistingConnection(),
    container.resolve<IGitForkService>('IGitForkService'),
    container.resolve<ILogger>('ILogger')
  );

  retention.start();
  trackers.start();
  knowledge.start();
  discovery.start();
  prComments.start();
  outcomes.start();
  getPrSyncWatcher().start();

  return {
    stop() {
      retention.stop();
      trackers.stop();
      knowledge.stop();
      discovery.stop();
      prComments.stop();
      outcomes.stop();
      getPrSyncWatcher().stop();
    },
  };
}
