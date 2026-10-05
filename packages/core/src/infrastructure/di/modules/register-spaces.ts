/**
 * Spaces and product lines (spec 120): repositories, the space resolver and
 * the management use cases, plus string-token aliases for web server actions.
 *
 * The memory use cases depend on ResolveSpaceContextUseCase, so this module
 * must be registered wherever project memory is resolved.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { ISpaceRepository } from '../../../application/ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../../application/ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '../../../application/ports/output/repositories/space-membership-repository.interface.js';
import { SQLiteSpaceRepository } from '../../repositories/sqlite-space.repository.js';
import { SQLiteProductLineRepository } from '../../repositories/sqlite-product-line.repository.js';
import { SQLiteSpaceMembershipRepository } from '../../repositories/sqlite-space-membership.repository.js';

import { ResolveSpaceContextUseCase } from '../../../application/use-cases/spaces/resolve-space-context.use-case.js';
import { CheckDocsGateUseCase } from '../../../application/use-cases/docs-first/check-docs-gate.use-case.js';
import { ManageSpacesUseCase } from '../../../application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSpaceMembershipUseCase } from '../../../application/use-cases/spaces/manage-space-membership.use-case.js';
import { GetSpacesOverviewUseCase } from '../../../application/use-cases/spaces/get-spaces-overview.use-case.js';
import { ConfigureSpaceAgentUseCase } from '../../../application/use-cases/spaces/configure-space-agent.use-case.js';
import { ResolveSpaceEnvironmentUseCase } from '../../../application/use-cases/spaces/resolve-space-environment.use-case.js';

export function registerSpaces(container: DependencyContainer): void {
  // ─── Repositories ────────────────────────────────────────────────────────
  container.register<ISpaceRepository>('ISpaceRepository', {
    useFactory: (c) => new SQLiteSpaceRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IProductLineRepository>('IProductLineRepository', {
    useFactory: (c) => new SQLiteProductLineRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ISpaceMembershipRepository>('ISpaceMembershipRepository', {
    useFactory: (c) =>
      new SQLiteSpaceMembershipRepository(c.resolve<Database.Database>('Database')),
  });

  // ─── Use cases (class-token singletons) ──────────────────────────────────
  container.registerSingleton(ResolveSpaceContextUseCase);
  container.registerSingleton(ManageSpacesUseCase);
  container.registerSingleton(ManageSpaceMembershipUseCase);
  container.registerSingleton(GetSpacesOverviewUseCase);
  container.registerSingleton(ConfigureSpaceAgentUseCase);
  container.registerSingleton(ResolveSpaceEnvironmentUseCase);
  container.registerSingleton(CheckDocsGateUseCase);

  // ─── String-token aliases (for web server actions) ───────────────────────
  container.register('ResolveSpaceContextUseCase', {
    useFactory: (c) => c.resolve(ResolveSpaceContextUseCase),
  });
  container.register('ManageSpacesUseCase', {
    useFactory: (c) => c.resolve(ManageSpacesUseCase),
  });
  container.register('ManageSpaceMembershipUseCase', {
    useFactory: (c) => c.resolve(ManageSpaceMembershipUseCase),
  });
  container.register('GetSpacesOverviewUseCase', {
    useFactory: (c) => c.resolve(GetSpacesOverviewUseCase),
  });
  container.register('ConfigureSpaceAgentUseCase', {
    useFactory: (c) => c.resolve(ConfigureSpaceAgentUseCase),
  });
  container.register('ResolveSpaceEnvironmentUseCase', {
    useFactory: (c) => c.resolve(ResolveSpaceEnvironmentUseCase),
  });
}
