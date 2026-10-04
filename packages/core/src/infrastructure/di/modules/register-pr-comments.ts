/**
 * PR comment loop (spec 124): comment and round repositories, the gh-based
 * pull request comment client and the use cases, plus string-token aliases
 * for web server actions and the daemon.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '../../../application/ports/output/repositories/pr-comment-repository.interface.js';
import type { IPullRequestCommentService } from '../../../application/ports/output/services/pull-request-comment-service.interface.js';
import {
  SQLitePrCommentRepository,
  SQLitePrCommentRoundRepository,
} from '../../repositories/sqlite-pr-comment.repository.js';
import { GhPullRequestCommentService } from '../../services/git/gh-pull-request-comment.service.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';

import { FetchPrCommentsUseCase } from '../../../application/use-cases/pr-comments/fetch-pr-comments.use-case.js';
import { AddressPrCommentsUseCase } from '../../../application/use-cases/pr-comments/address-pr-comments.use-case.js';
import { GetPrCommentsUseCase } from '../../../application/use-cases/pr-comments/get-pr-comments.use-case.js';
import { SyncPrCommentsUseCase } from '../../../application/use-cases/pr-comments/sync-pr-comments.use-case.js';

export function registerPrComments(container: DependencyContainer): void {
  container.register<IPrCommentRepository>('IPrCommentRepository', {
    useFactory: (c) => new SQLitePrCommentRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPrCommentRoundRepository>('IPrCommentRoundRepository', {
    useFactory: (c) => new SQLitePrCommentRoundRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IPullRequestCommentService>('IPullRequestCommentService', {
    useFactory: (c) => new GhPullRequestCommentService(c.resolve<ExecFunction>('ExecFunction')),
  });

  container.registerSingleton(FetchPrCommentsUseCase);
  container.registerSingleton(AddressPrCommentsUseCase);
  container.registerSingleton(GetPrCommentsUseCase);
  container.registerSingleton(SyncPrCommentsUseCase);

  container.register('FetchPrCommentsUseCase', {
    useFactory: (c) => c.resolve(FetchPrCommentsUseCase),
  });
  container.register('AddressPrCommentsUseCase', {
    useFactory: (c) => c.resolve(AddressPrCommentsUseCase),
  });
  container.register('GetPrCommentsUseCase', {
    useFactory: (c) => c.resolve(GetPrCommentsUseCase),
  });
  container.register('SyncPrCommentsUseCase', {
    useFactory: (c) => c.resolve(SyncPrCommentsUseCase),
  });
}
