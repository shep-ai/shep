/**
 * Tracker sync (spec 122): repositories, the tracker client factory and the
 * use cases, plus string-token aliases for web server actions.
 *
 * The connection repository encrypts secrets with the LocalSecretBox that
 * registerCloudDeploy registers.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { ITrackerConnectionRepository } from '../../../application/ports/output/repositories/tracker-connection-repository.interface.js';
import type { ITrackerSyncRuleRepository } from '../../../application/ports/output/repositories/tracker-sync-rule-repository.interface.js';
import type { ITrackerIssueLinkRepository } from '../../../application/ports/output/repositories/tracker-issue-link-repository.interface.js';
import type { ITrackerClientFactory } from '../../../application/ports/output/services/tracker-client.interface.js';
import { SQLiteTrackerConnectionRepository } from '../../repositories/sqlite-tracker-connection.repository.js';
import { SQLiteTrackerSyncRuleRepository } from '../../repositories/sqlite-tracker-sync-rule.repository.js';
import { SQLiteTrackerIssueLinkRepository } from '../../repositories/sqlite-tracker-issue-link.repository.js';
import { LocalSecretBox } from '../../services/crypto/local-secret-box.js';
import { TrackerClientFactory } from '../../services/trackers/tracker-client.factory.js';

import { ManageTrackerConnectionsUseCase } from '../../../application/use-cases/trackers/manage-tracker-connections.use-case.js';
import { ManageTrackerSyncRulesUseCase } from '../../../application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import { RunTrackerSyncUseCase } from '../../../application/use-cases/trackers/run-tracker-sync.use-case.js';
import { SyncTrackerRulesUseCase } from '../../../application/use-cases/trackers/sync-tracker-rules.use-case.js';
import { GetTrackerIssueLinkUseCase } from '../../../application/use-cases/trackers/get-tracker-issue-link.use-case.js';
import { GetTrackerOverviewUseCase } from '../../../application/use-cases/trackers/get-tracker-overview.use-case.js';

export function registerTrackers(container: DependencyContainer): void {
  // ─── Repositories ────────────────────────────────────────────────────────
  container.register<ITrackerConnectionRepository>('ITrackerConnectionRepository', {
    useFactory: (c) =>
      new SQLiteTrackerConnectionRepository(
        c.resolve<Database.Database>('Database'),
        c.resolve(LocalSecretBox)
      ),
  });
  container.register<ITrackerSyncRuleRepository>('ITrackerSyncRuleRepository', {
    useFactory: (c) =>
      new SQLiteTrackerSyncRuleRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ITrackerIssueLinkRepository>('ITrackerIssueLinkRepository', {
    useFactory: (c) =>
      new SQLiteTrackerIssueLinkRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ITrackerClientFactory>('ITrackerClientFactory', {
    useValue: new TrackerClientFactory(),
  });

  // ─── Use cases (class-token singletons) ──────────────────────────────────
  container.registerSingleton(ManageTrackerConnectionsUseCase);
  container.registerSingleton(ManageTrackerSyncRulesUseCase);
  container.registerSingleton(RunTrackerSyncUseCase);
  container.registerSingleton(SyncTrackerRulesUseCase);
  container.registerSingleton(GetTrackerIssueLinkUseCase);
  container.registerSingleton(GetTrackerOverviewUseCase);

  // ─── String-token aliases (for web server actions) ───────────────────────
  container.register('ManageTrackerConnectionsUseCase', {
    useFactory: (c) => c.resolve(ManageTrackerConnectionsUseCase),
  });
  container.register('ManageTrackerSyncRulesUseCase', {
    useFactory: (c) => c.resolve(ManageTrackerSyncRulesUseCase),
  });
  container.register('RunTrackerSyncUseCase', {
    useFactory: (c) => c.resolve(RunTrackerSyncUseCase),
  });
  container.register('SyncTrackerRulesUseCase', {
    useFactory: (c) => c.resolve(SyncTrackerRulesUseCase),
  });
  container.register('GetTrackerIssueLinkUseCase', {
    useFactory: (c) => c.resolve(GetTrackerIssueLinkUseCase),
  });
  container.register('GetTrackerOverviewUseCase', {
    useFactory: (c) => c.resolve(GetTrackerOverviewUseCase),
  });
}
