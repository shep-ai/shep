import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { ICloudProviderTokensRepository } from '../../../application/ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import { SQLiteCloudProviderTokensRepository } from '../../repositories/sqlite-cloud-provider-tokens.repository.js';
import { LocalSecretBox } from '../../services/crypto/local-secret-box.js';
import { loadOrCreateSecretKey } from '../../services/crypto/secret-key-file.js';
import { getShepHomeDir } from '../../services/filesystem/shep-directory.service.js';
import type { ICloudDeploymentProvider } from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../../application/ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ICloudDeploymentEventBus } from '../../../application/ports/output/services/cloud-deployment-event-bus.interface.js';
import type { IGitRemoteService } from '../../../application/ports/output/services/git-remote.service.interface.js';
import {
  CloudDeploymentProviderRegistry,
  CLOUD_DEPLOYMENT_PROVIDER_TOKEN,
} from '../../services/cloud-deploy/cloud-deployment-provider.registry.js';
import { CloudflarePagesProvider } from '../../services/cloud-deploy/cloudflare-pages.provider.js';
import { VercelProviderStub } from '../../services/cloud-deploy/vercel.provider.stub.js';
import { NetlifyProviderStub } from '../../services/cloud-deploy/netlify.provider.stub.js';
import { AwsAmplifyProviderStub } from '../../services/cloud-deploy/aws-amplify.provider.stub.js';
import { GcpCloudRunProviderStub } from '../../services/cloud-deploy/gcp-cloud-run.provider.stub.js';
import { InMemoryCloudDeploymentEventBus } from '../../services/events/in-memory-cloud-deployment-event-bus.js';
import { GitRemoteService } from '../../services/git/git-remote.service.js';
import { CloudDeploymentProvider } from '../../../domain/generated/output.js';

import { ListCloudProvidersUseCase } from '../../../application/use-cases/cloud-deploy/list-cloud-providers.use-case.js';
import { ConnectCloudProviderUseCase } from '../../../application/use-cases/cloud-deploy/connect-cloud-provider.use-case.js';
import { SelectCloudProviderUseCase } from '../../../application/use-cases/cloud-deploy/select-cloud-provider.use-case.js';
import { InitiateCloudDeploymentUseCase } from '../../../application/use-cases/cloud-deploy/initiate-cloud-deployment.use-case.js';
import { GetCloudDeploymentStatusUseCase } from '../../../application/use-cases/cloud-deploy/get-cloud-deployment-status.use-case.js';
import { CreateGitRemoteUseCase } from '../../../application/use-cases/cloud-deploy/create-git-remote.use-case.js';
import { EnsureGhAuthenticatedUseCase } from '../../../application/use-cases/cloud-deploy/ensure-gh-authenticated.use-case.js';
import { GetGitStatusUseCase } from '../../../application/use-cases/cloud-deploy/get-git-status.use-case.js';
import { SyncRepoUseCase } from '../../../application/use-cases/cloud-deploy/sync-repo.use-case.js';

/**
 * Cloud deployment registrations (spec 089).
 *
 * Registers the secret box, per-provider adapters, provider registry, event bus,
 * git-remote service, token repository, and the cloud-deploy use cases.
 */
export function registerCloudDeploy(container: DependencyContainer): void {
  // FetchFunction — injected into CloudflarePagesProvider so tests can swap it.
  container.registerInstance('FetchFunction', globalThis.fetch.bind(globalThis));

  // Clock for the cloudflare provider's polling loop. Tests can override.
  // Tsyringe does not honor TypeScript default-parameter values for @inject,
  // so a real registration is required even though the constructor has a default.
  container.registerInstance('CloudflareProviderClock', {
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });

  // LocalSecretBox keyed by ~/.shep/secret.key (atomic wx create on first run).
  container.register<LocalSecretBox>(LocalSecretBox, {
    useFactory: () => new LocalSecretBox(loadOrCreateSecretKey(getShepHomeDir())),
  });

  // Token repository — encrypts with the shared LocalSecretBox.
  container.register<ICloudProviderTokensRepository>('ICloudProviderTokensRepository', {
    useFactory: (c) => {
      const db = c.resolve<Database.Database>('Database');
      const box = c.resolve(LocalSecretBox);
      return new SQLiteCloudProviderTokensRepository(db, box);
    },
  });

  // Per-provider registrations (mirrors AgentSessionRepositoryRegistry pattern).
  container.registerSingleton<ICloudDeploymentProvider>(
    CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.CloudflarePages),
    CloudflarePagesProvider
  );
  container.registerSingleton<ICloudDeploymentProvider>(
    CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.Vercel),
    VercelProviderStub
  );
  container.registerSingleton<ICloudDeploymentProvider>(
    CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.Netlify),
    NetlifyProviderStub
  );
  container.registerSingleton<ICloudDeploymentProvider>(
    CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.AwsAmplify),
    AwsAmplifyProviderStub
  );
  container.registerSingleton<ICloudDeploymentProvider>(
    CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.GcpCloudRun),
    GcpCloudRunProviderStub
  );

  container.registerSingleton<ICloudDeploymentProviderRegistry>(
    'ICloudDeploymentProviderRegistry',
    CloudDeploymentProviderRegistry
  );
  container.registerSingleton<ICloudDeploymentEventBus>(
    'ICloudDeploymentEventBus',
    InMemoryCloudDeploymentEventBus
  );
  container.registerSingleton<IGitRemoteService>('IGitRemoteService', GitRemoteService);

  // Cloud deployment use cases (spec 089). String-token aliases added so
  // web routes can do `resolve<T>('UseCaseName')` — needed because next.js
  // server-side resolve lives outside the core di bootstrap.
  container.registerSingleton(ListCloudProvidersUseCase);
  container.register('ListCloudProvidersUseCase', {
    useFactory: (c) => c.resolve(ListCloudProvidersUseCase),
  });
  container.registerSingleton(ConnectCloudProviderUseCase);
  container.register('ConnectCloudProviderUseCase', {
    useFactory: (c) => c.resolve(ConnectCloudProviderUseCase),
  });
  container.registerSingleton(SelectCloudProviderUseCase);
  container.register('SelectCloudProviderUseCase', {
    useFactory: (c) => c.resolve(SelectCloudProviderUseCase),
  });
  container.registerSingleton(InitiateCloudDeploymentUseCase);
  container.register('InitiateCloudDeploymentUseCase', {
    useFactory: (c) => c.resolve(InitiateCloudDeploymentUseCase),
  });
  container.registerSingleton(GetCloudDeploymentStatusUseCase);
  container.register('GetCloudDeploymentStatusUseCase', {
    useFactory: (c) => c.resolve(GetCloudDeploymentStatusUseCase),
  });
  container.registerSingleton(CreateGitRemoteUseCase);
  container.register('CreateGitRemoteUseCase', {
    useFactory: (c) => c.resolve(CreateGitRemoteUseCase),
  });
  container.registerSingleton(EnsureGhAuthenticatedUseCase);
  container.register('EnsureGhAuthenticatedUseCase', {
    useFactory: (c) => c.resolve(EnsureGhAuthenticatedUseCase),
  });
  container.registerSingleton(GetGitStatusUseCase);
  container.register('GetGitStatusUseCase', {
    useFactory: (c) => c.resolve(GetGitStatusUseCase),
  });
  container.registerSingleton(SyncRepoUseCase);
  container.register('SyncRepoUseCase', {
    useFactory: (c) => c.resolve(SyncRepoUseCase),
  });
}
