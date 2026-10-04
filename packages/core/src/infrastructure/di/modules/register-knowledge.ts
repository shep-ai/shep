/**
 * Knowledge sources (spec 125): repositories, the knowledge client factory,
 * the connection verifier and the use cases, plus string-token aliases for
 * web server actions and the daemon.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type {
  IKnowledgeDocumentRepository,
  IKnowledgeSourceRepository,
} from '../../../application/ports/output/repositories/knowledge-repository.interface.js';
import type { IKnowledgeClientFactory } from '../../../application/ports/output/services/knowledge-client.interface.js';
import type { IConnectionVerifier } from '../../../application/ports/output/services/connection-verifier.interface.js';
import type { ITrackerClientFactory } from '../../../application/ports/output/services/tracker-client.interface.js';
import {
  SQLiteKnowledgeDocumentRepository,
  SQLiteKnowledgeSourceRepository,
} from '../../repositories/sqlite-knowledge.repository.js';
import { KnowledgeClientFactory } from '../../services/knowledge/knowledge-client.factory.js';
import { ConnectionVerifier } from '../../services/connections/connection-verifier.js';

import { ManageKnowledgeSourcesUseCase } from '../../../application/use-cases/knowledge/manage-knowledge-sources.use-case.js';
import { SyncKnowledgeSourceUseCase } from '../../../application/use-cases/knowledge/sync-knowledge-source.use-case.js';
import { SyncKnowledgeSourcesUseCase } from '../../../application/use-cases/knowledge/sync-knowledge-sources.use-case.js';
import { SelectKnowledgeUseCase } from '../../../application/use-cases/knowledge/select-knowledge.use-case.js';
import { ListKnowledgeUseCase } from '../../../application/use-cases/knowledge/list-knowledge.use-case.js';

export function registerKnowledge(container: DependencyContainer): void {
  container.register<IKnowledgeSourceRepository>('IKnowledgeSourceRepository', {
    useFactory: (c) =>
      new SQLiteKnowledgeSourceRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IKnowledgeDocumentRepository>('IKnowledgeDocumentRepository', {
    useFactory: (c) =>
      new SQLiteKnowledgeDocumentRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IKnowledgeClientFactory>('IKnowledgeClientFactory', {
    useValue: new KnowledgeClientFactory(),
  });
  container.register<IConnectionVerifier>('IConnectionVerifier', {
    useFactory: (c) =>
      new ConnectionVerifier(
        c.resolve<ITrackerClientFactory>('ITrackerClientFactory'),
        c.resolve<IKnowledgeClientFactory>('IKnowledgeClientFactory')
      ),
  });

  container.registerSingleton(ManageKnowledgeSourcesUseCase);
  container.registerSingleton(SyncKnowledgeSourceUseCase);
  container.registerSingleton(SyncKnowledgeSourcesUseCase);
  container.registerSingleton(SelectKnowledgeUseCase);
  container.registerSingleton(ListKnowledgeUseCase);

  container.register('ManageKnowledgeSourcesUseCase', {
    useFactory: (c) => c.resolve(ManageKnowledgeSourcesUseCase),
  });
  container.register('SyncKnowledgeSourceUseCase', {
    useFactory: (c) => c.resolve(SyncKnowledgeSourceUseCase),
  });
  container.register('SyncKnowledgeSourcesUseCase', {
    useFactory: (c) => c.resolve(SyncKnowledgeSourcesUseCase),
  });
  container.register('SelectKnowledgeUseCase', {
    useFactory: (c) => c.resolve(SelectKnowledgeUseCase),
  });
  container.register('ListKnowledgeUseCase', {
    useFactory: (c) => c.resolve(ListKnowledgeUseCase),
  });
}
