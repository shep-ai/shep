/**
 * Feedback intake and themes (spec 127): the key repository and generator,
 * the use cases, and string-token aliases for web server actions and the
 * feedback endpoint.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IFeedbackKeyRepository } from '../../../application/ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../../application/ports/output/services/feedback-key-generator.interface.js';
import { SQLiteFeedbackKeyRepository } from '../../repositories/sqlite-feedback-key.repository.js';
import { FeedbackKeyGenerator } from '../../services/feedback/feedback-key-generator.js';

import { ManageFeedbackKeysUseCase } from '../../../application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { IngestFeedbackUseCase } from '../../../application/use-cases/feedback/ingest-feedback.use-case.js';
import {
  GetFeedbackThemesUseCase,
  PromoteThemeUseCase,
} from '../../../application/use-cases/feedback/feedback-themes.use-case.js';

export function registerFeedback(container: DependencyContainer): void {
  container.register<IFeedbackKeyRepository>('IFeedbackKeyRepository', {
    useFactory: (c) => new SQLiteFeedbackKeyRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IFeedbackKeyGenerator>('IFeedbackKeyGenerator', {
    useValue: new FeedbackKeyGenerator(),
  });

  container.registerSingleton(ManageFeedbackKeysUseCase);
  container.registerSingleton(IngestFeedbackUseCase);
  container.registerSingleton(GetFeedbackThemesUseCase);
  container.registerSingleton(PromoteThemeUseCase);

  container.register('ManageFeedbackKeysUseCase', {
    useFactory: (c) => c.resolve(ManageFeedbackKeysUseCase),
  });
  container.register('IngestFeedbackUseCase', {
    useFactory: (c) => c.resolve(IngestFeedbackUseCase),
  });
  container.register('GetFeedbackThemesUseCase', {
    useFactory: (c) => c.resolve(GetFeedbackThemesUseCase),
  });
  container.register('PromoteThemeUseCase', {
    useFactory: (c) => c.resolve(PromoteThemeUseCase),
  });
}
