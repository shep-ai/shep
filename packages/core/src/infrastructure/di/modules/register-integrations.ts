import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IGithubIntegrationRepository } from '../../../application/ports/output/repositories/github-integration.repository.interface.js';
import { SQLiteGithubIntegrationRepository } from '../../repositories/sqlite-github-integration.repository.js';
import { LocalSecretBox } from '../../services/crypto/local-secret-box.js';

import { ConnectGithubUseCase } from '../../../application/use-cases/integrations/connect-github.use-case.js';
import { DisconnectGithubUseCase } from '../../../application/use-cases/integrations/disconnect-github.use-case.js';
import { GetGithubIntegrationStatusUseCase } from '../../../application/use-cases/integrations/get-github-integration-status.use-case.js';

/**
 * Third-party developer-tool integrations (GitHub, etc.).
 *
 * LocalSecretBox is registered by registerCloudDeploy — these registrations
 * just resolve it. registerCloudDeploy must run before this module.
 */
export function registerIntegrations(container: DependencyContainer): void {
  container.register<IGithubIntegrationRepository>('IGithubIntegrationRepository', {
    useFactory: (c) => {
      const db = c.resolve<Database.Database>('Database');
      const box = c.resolve(LocalSecretBox);
      return new SQLiteGithubIntegrationRepository(db, box);
    },
  });

  container.registerSingleton(ConnectGithubUseCase);
  container.register('ConnectGithubUseCase', {
    useFactory: (c) => c.resolve(ConnectGithubUseCase),
  });

  container.registerSingleton(DisconnectGithubUseCase);
  container.register('DisconnectGithubUseCase', {
    useFactory: (c) => c.resolve(DisconnectGithubUseCase),
  });

  container.registerSingleton(GetGithubIntegrationStatusUseCase);
  container.register('GetGithubIntegrationStatusUseCase', {
    useFactory: (c) => c.resolve(GetGithubIntegrationStatusUseCase),
  });
}
