import 'reflect-metadata';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ApplicationStatus,
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  type Application,
} from '@/domain/generated/output.js';
import { ListCloudProvidersUseCase } from '@/application/use-cases/cloud-deploy/list-cloud-providers.use-case.js';
import { ConnectCloudProviderUseCase } from '@/application/use-cases/cloud-deploy/connect-cloud-provider.use-case.js';
import { SelectCloudProviderUseCase } from '@/application/use-cases/cloud-deploy/select-cloud-provider.use-case.js';
import { GetCloudDeploymentStatusUseCase } from '@/application/use-cases/cloud-deploy/get-cloud-deployment-status.use-case.js';
import { CreateGitRemoteUseCase } from '@/application/use-cases/cloud-deploy/create-git-remote.use-case.js';
import { EnsureGhAuthenticatedUseCase } from '@/application/use-cases/cloud-deploy/ensure-gh-authenticated.use-case.js';
import { GetGitStatusUseCase } from '@/application/use-cases/cloud-deploy/get-git-status.use-case.js';
import { SyncRepoUseCase } from '@/application/use-cases/cloud-deploy/sync-repo.use-case.js';
import { InitiateCloudDeploymentUseCase } from '@/application/use-cases/cloud-deploy/initiate-cloud-deployment.use-case.js';
import { NoProviderSelectedError } from '@/domain/errors/no-provider-selected.error.js';
import { BuildOutputNotFoundError } from '@/domain/errors/build-output-not-found.error.js';
import { CloudProviderNotConnectedError } from '@/domain/errors/cloud-provider-not-connected.error.js';
import { ProviderNotImplementedError } from '@/domain/errors/provider-not-implemented.error.js';
import type { ICloudDeploymentProvider } from '@/application/ports/output/services/cloud-deployment-provider.interface.js';
import type { ICloudDeploymentProviderRegistry } from '@/application/ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ICloudProviderTokensRepository } from '@/application/ports/output/repositories/cloud-provider-tokens.repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IGitRemoteService } from '@/application/ports/output/services/git-remote.service.interface.js';
import { GhNotAuthenticatedError } from '@/domain/errors/gh-not-authenticated.error.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type {
  CloudDeploymentEvent,
  ICloudDeploymentEventBus,
} from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';
import { GitRemoteCreationError } from '@/domain/errors/git-remote-creation.error.js';

// ─────────────────────────────── Fakes ───────────────────────────────

class FakeTokensRepo implements ICloudProviderTokensRepository {
  store = new Map<CloudDeploymentProvider, string>();
  async get(p: CloudDeploymentProvider) {
    return this.store.get(p) ?? null;
  }
  async set(p: CloudDeploymentProvider, token: string) {
    this.store.set(p, token);
  }
  async remove(p: CloudDeploymentProvider) {
    this.store.delete(p);
  }
  async listConnected() {
    return [...this.store.keys()];
  }
}

class FakeApplicationRepo implements IApplicationRepository {
  apps = new Map<string, Application>();
  async create(a: Application) {
    this.apps.set(a.id, { ...a });
  }
  async findById(id: string) {
    return this.apps.get(id) ?? null;
  }
  async findBySlug() {
    return null;
  }
  async findByPath() {
    return null;
  }
  async list() {
    return [...this.apps.values()];
  }
  async update(id: string, fields: Partial<Application>) {
    const app = this.apps.get(id);
    if (!app) return;
    this.apps.set(id, { ...app, ...fields });
  }
  async softDelete(id: string) {
    this.apps.delete(id);
  }
  async restore(): Promise<void> {
    /* no-op for tests */
  }
}

class FakeRegistry implements ICloudDeploymentProviderRegistry {
  constructor(
    private providers: Map<CloudDeploymentProvider, ICloudDeploymentProvider> = new Map()
  ) {}
  listAll() {
    return [...this.providers.values()].map((p) => ({
      id: p.providerId,
      displayName: p.displayName,
      enabled: p.enabled,
    }));
  }
  get(id: CloudDeploymentProvider) {
    const p = this.providers.get(id);
    if (!p) throw new Error(`no provider ${id}`);
    return p;
  }
}

class FakeFs implements IFileSystemService {
  constructor(public existingPaths = new Set<string>()) {}
  async removeDirectory(): Promise<void> {
    /* no-op for tests */
  }
  pathExists(p: string): boolean {
    return this.existingPaths.has(p);
  }
}

class FakeEventBus implements ICloudDeploymentEventBus {
  published: CloudDeploymentEvent[] = [];
  publish(e: CloudDeploymentEvent): void {
    this.published.push(e);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

class SilentLogger implements ILogger {
  debug(): void {
    /* silent */
  }
  info(): void {
    /* silent */
  }
  warn(): void {
    /* silent */
  }
  error(): void {
    /* silent */
  }
}

/**
 * In-memory IOperationLogService used by the deploy use-case tests. Records
 * every appended entry so individual tests can assert specific lines were
 * written, without needing to go through SQLite.
 */
class FakeOperationLogService {
  readonly entries: { level: string; message: string; detail?: string }[] = [];
  private record(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    detail?: string
  ): Promise<{
    id: string;
    operationKind: string;
    operationId: string;
    level: string;
    message: string;
    detail: string | undefined;
    createdAt: Date;
    updatedAt: Date;
  }> {
    this.entries.push({ level, message, detail });
    const now = new Date();
    return Promise.resolve({
      id: `${level}-${this.entries.length}`,
      operationKind: 'CloudDeploy',
      operationId: 'app-1',
      level,
      message,
      detail,
      createdAt: now,
      updatedAt: now,
    });
  }
  debug(_k: unknown, _i: unknown, m: string, d?: string) {
    return this.record('debug', m, d);
  }
  info(_k: unknown, _i: unknown, m: string, d?: string) {
    return this.record('info', m, d);
  }
  warn(_k: unknown, _i: unknown, m: string, d?: string) {
    return this.record('warn', m, d);
  }
  error(_k: unknown, _i: unknown, m: string, d?: string) {
    return this.record('error', m, d);
  }
  list() {
    return Promise.resolve([]);
  }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    name: 'App',
    slug: 'app-slug',
    description: 'desc',
    repositoryPath: '/repo',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLiveProvider(
  behaviour: {
    isConnected?: boolean;
    validateTokenThrows?: Error;
    deployResult?: { deploymentId: string; url: string };
    deployThrows?: Error;
  } = {}
): ICloudDeploymentProvider {
  return {
    providerId: CloudDeploymentProvider.CloudflarePages,
    displayName: 'Cloudflare Pages',
    enabled: true,
    isConnected: async () => behaviour.isConnected ?? true,
    validateToken: async () => {
      if (behaviour.validateTokenThrows) throw behaviour.validateTokenThrows;
    },
    deploy: async (_input, onProgress) => {
      if (behaviour.deployThrows) throw behaviour.deployThrows;
      onProgress(CloudDeploymentStatus.Uploading);
      onProgress(CloudDeploymentStatus.Deploying);
      const res = behaviour.deployResult ?? {
        deploymentId: 'dep-1',
        url: 'https://example.pages.dev',
      };
      return res;
    },
    getStatus: async () => ({ status: CloudDeploymentStatus.Deployed }),
  };
}

function makeDisabledProvider(id: CloudDeploymentProvider): ICloudDeploymentProvider {
  return {
    providerId: id,
    displayName: id,
    enabled: false,
    isConnected: async () => false,
    validateToken: async () => {
      throw new ProviderNotImplementedError(id);
    },
    deploy: async () => {
      throw new ProviderNotImplementedError(id);
    },
    getStatus: async () => ({ status: CloudDeploymentStatus.NotDeployed }),
  };
}

// ─────────────────────────────── Tests ───────────────────────────────

describe('ListCloudProvidersUseCase', () => {
  it('returns every provider with enabled + connected flags', async () => {
    const registry = new FakeRegistry(
      new Map<CloudDeploymentProvider, ICloudDeploymentProvider>([
        [CloudDeploymentProvider.CloudflarePages, makeLiveProvider()],
        [CloudDeploymentProvider.Vercel, makeDisabledProvider(CloudDeploymentProvider.Vercel)],
      ])
    );
    const tokens = new FakeTokensRepo();
    await tokens.set(CloudDeploymentProvider.CloudflarePages, 't');
    const useCase = new ListCloudProvidersUseCase(registry, tokens);
    const result = await useCase.execute();
    const cf = result.find((r) => r.id === CloudDeploymentProvider.CloudflarePages)!;
    const vercel = result.find((r) => r.id === CloudDeploymentProvider.Vercel)!;
    expect(cf.enabled).toBe(true);
    expect(cf.connected).toBe(true);
    expect(vercel.enabled).toBe(false);
    expect(vercel.connected).toBe(false);
  });
});

describe('ConnectCloudProviderUseCase', () => {
  it('happy path validates and persists the token', async () => {
    const registry = new FakeRegistry(
      new Map([[CloudDeploymentProvider.CloudflarePages, makeLiveProvider()]])
    );
    const tokens = new FakeTokensRepo();
    const useCase = new ConnectCloudProviderUseCase(registry, tokens);
    await useCase.execute({ provider: CloudDeploymentProvider.CloudflarePages, token: 'abc' });
    expect(await tokens.get(CloudDeploymentProvider.CloudflarePages)).toBe('abc');
  });

  it('does not persist on validate failure', async () => {
    const registry = new FakeRegistry(
      new Map([
        [
          CloudDeploymentProvider.CloudflarePages,
          makeLiveProvider({ validateTokenThrows: new Error('bad token') }),
        ],
      ])
    );
    const tokens = new FakeTokensRepo();
    const useCase = new ConnectCloudProviderUseCase(registry, tokens);
    await expect(
      useCase.execute({ provider: CloudDeploymentProvider.CloudflarePages, token: 'abc' })
    ).rejects.toThrow(/bad token/);
    expect(await tokens.get(CloudDeploymentProvider.CloudflarePages)).toBeNull();
  });

  it('rejects disabled providers', async () => {
    const registry = new FakeRegistry(
      new Map([
        [CloudDeploymentProvider.Vercel, makeDisabledProvider(CloudDeploymentProvider.Vercel)],
      ])
    );
    const tokens = new FakeTokensRepo();
    const useCase = new ConnectCloudProviderUseCase(registry, tokens);
    await expect(
      useCase.execute({ provider: CloudDeploymentProvider.Vercel, token: 'x' })
    ).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });
});

describe('SelectCloudProviderUseCase', () => {
  it('persists the provider on the Application', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp());
    const useCase = new SelectCloudProviderUseCase(repo);
    await useCase.execute({
      applicationId: 'app-1',
      provider: CloudDeploymentProvider.CloudflarePages,
    });
    expect((await repo.findById('app-1'))!.cloudDeploymentProvider).toBe(
      CloudDeploymentProvider.CloudflarePages
    );
  });

  it('throws ApplicationNotFoundError for unknown ids', async () => {
    const repo = new FakeApplicationRepo();
    const useCase = new SelectCloudProviderUseCase(repo);
    await expect(
      useCase.execute({
        applicationId: 'missing',
        provider: CloudDeploymentProvider.CloudflarePages,
      })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });
});

describe('GetCloudDeploymentStatusUseCase', () => {
  it('returns the persisted cloud fields', async () => {
    const repo = new FakeApplicationRepo();
    const now = new Date();
    await repo.create(
      makeApp({
        cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
        cloudDeploymentStatus: CloudDeploymentStatus.Deployed,
        cloudDeploymentUrl: 'https://x.pages.dev',
        cloudDeploymentId: 'dep-1',
        lastDeployedAt: now,
        gitRemoteUrl: 'https://github.com/u/r',
      })
    );
    const useCase = new GetCloudDeploymentStatusUseCase(repo);
    const dto = await useCase.execute('app-1');
    expect(dto.status).toBe(CloudDeploymentStatus.Deployed);
    expect(dto.url).toBe('https://x.pages.dev');
    expect(dto.gitRemoteUrl).toBe('https://github.com/u/r');
  });
});

describe('CreateGitRemoteUseCase', () => {
  const gitRemote: IGitRemoteService = {
    isGhAuthenticated: async () => true,
    createGitHubRepoAndPush: async () => ({ remoteUrl: 'https://github.com/u/app-slug' }),
    getStatus: async () => ({
      branch: 'main',
      uncommittedCount: 0,
      unpushedCount: 0,
      hasRemote: true,
      remoteUrl: 'https://github.com/u/app-slug',
    }),
    commitAndPush: async () => ({ headSha: 'sha', committed: false, pushed: false }),
  };

  it('persists the remote URL on success', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp());
    const opLog = new FakeOperationLogService();
    const useCase = new CreateGitRemoteUseCase(
      repo,
      gitRemote,
      opLog as unknown as ConstructorParameters<typeof CreateGitRemoteUseCase>[2]
    );
    const result = await useCase.execute('app-1');
    expect(result.remoteUrl).toBe('https://github.com/u/app-slug');
    expect((await repo.findById('app-1'))!.gitRemoteUrl).toBe('https://github.com/u/app-slug');
  });

  it('does not persist on GhNotAuthenticatedError', async () => {
    const failingGit: IGitRemoteService = {
      isGhAuthenticated: async () => false,
      createGitHubRepoAndPush: async () => {
        throw new GhNotAuthenticatedError();
      },
      getStatus: async () => ({
        branch: null,
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: false,
        remoteUrl: null,
      }),
      commitAndPush: async () => {
        throw new GhNotAuthenticatedError();
      },
    };
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp());
    const opLog = new FakeOperationLogService();
    const useCase = new CreateGitRemoteUseCase(
      repo,
      failingGit,
      opLog as unknown as ConstructorParameters<typeof CreateGitRemoteUseCase>[2]
    );
    await expect(useCase.execute('app-1')).rejects.toBeInstanceOf(GhNotAuthenticatedError);
    expect((await repo.findById('app-1'))!.gitRemoteUrl).toBeUndefined();
  });
});

describe('GetGitStatusUseCase', () => {
  it('returns the working tree status from the git remote service', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp());
    const svc: IGitRemoteService = {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      getStatus: async () => ({
        branch: 'main',
        uncommittedCount: 3,
        unpushedCount: 1,
        hasRemote: true,
        remoteUrl: 'https://github.com/u/r',
      }),
      commitAndPush: async () => ({ headSha: 'sha', committed: false, pushed: false }),
    };
    const useCase = new GetGitStatusUseCase(repo, svc);
    const result = await useCase.execute({ applicationId: 'app-1' });
    expect(result.uncommittedCount).toBe(3);
    expect(result.unpushedCount).toBe(1);
    expect(result.hasRemote).toBe(true);
  });

  it('throws ApplicationNotFoundError when the app id is unknown', async () => {
    const repo = new FakeApplicationRepo();
    const svc: IGitRemoteService = {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      getStatus: async () => ({
        branch: null,
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: false,
        remoteUrl: null,
      }),
      commitAndPush: async () => ({ headSha: '', committed: false, pushed: false }),
    };
    const useCase = new GetGitStatusUseCase(repo, svc);
    await expect(useCase.execute({ applicationId: 'missing' })).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    );
  });

  it('uses the persisted Application.gitRemoteUrl when the live git status reports no remote (regression)', async () => {
    // Repro: an app has been published (so gitRemoteUrl is in the DB),
    // but a transient `git remote get-url origin` failure makes the live
    // status return hasRemote=false. The use case must still report the
    // remote so the UI doesn't render "No backup yet" for a published
    // app — the persisted URL is the authoritative source of truth.
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp({ gitRemoteUrl: 'https://github.com/blackpc/landing-page-hero' }));
    const svc: IGitRemoteService = {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      // Live git status pretends the remote is missing.
      getStatus: async () => ({
        branch: 'main',
        uncommittedCount: 2,
        unpushedCount: 0,
        hasRemote: false,
        remoteUrl: null,
      }),
      commitAndPush: async () => ({ headSha: '', committed: false, pushed: false }),
    };
    const useCase = new GetGitStatusUseCase(repo, svc);
    const result = await useCase.execute({ applicationId: 'app-1' });
    // hasRemote MUST be true because the Application row has a stored URL,
    // even though the live subprocess returned false.
    expect(result.hasRemote).toBe(true);
    expect(result.remoteUrl).toBe('https://github.com/blackpc/landing-page-hero');
    // Drift counts from the live read are still preserved.
    expect(result.uncommittedCount).toBe(2);
    expect(result.branch).toBe('main');
  });

  it('prefers the live remote URL when both sources are populated', async () => {
    // If the live status DID find a remote, keep its URL — it's the
    // freshest source. The persisted URL is only the fallback for the
    // hasRemote decision.
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp({ gitRemoteUrl: 'https://github.com/old/old' }));
    const svc: IGitRemoteService = {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      getStatus: async () => ({
        branch: 'main',
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: true,
        remoteUrl: 'https://github.com/new/new',
      }),
      commitAndPush: async () => ({ headSha: '', committed: false, pushed: false }),
    };
    const useCase = new GetGitStatusUseCase(repo, svc);
    const result = await useCase.execute({ applicationId: 'app-1' });
    expect(result.hasRemote).toBe(true);
    expect(result.remoteUrl).toBe('https://github.com/new/new');
  });
});

describe('SyncRepoUseCase', () => {
  function buildSvc(overrides: Partial<IGitRemoteService> = {}): IGitRemoteService {
    return {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      getStatus: async () => ({
        branch: 'main',
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: true,
        remoteUrl: 'https://github.com/u/r',
      }),
      commitAndPush: async () => ({ headSha: 'newhead', committed: true, pushed: true }),
      ...overrides,
    };
  }

  it('throws when the app has no git remote attached yet', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp({ gitRemoteUrl: undefined }));
    const opLog = new FakeOperationLogService();
    const useCase = new SyncRepoUseCase(
      repo,
      buildSvc(),
      opLog as unknown as ConstructorParameters<typeof SyncRepoUseCase>[2]
    );
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toBeInstanceOf(
      GitRemoteCreationError
    );
  });

  it('delegates to gitRemoteService.commitAndPush and returns its result', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp({ gitRemoteUrl: 'https://github.com/u/r' }));
    const opLog = new FakeOperationLogService();
    const svc = buildSvc();
    const useCase = new SyncRepoUseCase(
      repo,
      svc,
      opLog as unknown as ConstructorParameters<typeof SyncRepoUseCase>[2]
    );
    const result = await useCase.execute({ applicationId: 'app-1' });
    expect(result).toEqual({ headSha: 'newhead', committed: true, pushed: true });
  });

  it('appends Info entries on success and Error entries on failure', async () => {
    const repo = new FakeApplicationRepo();
    await repo.create(makeApp({ gitRemoteUrl: 'https://github.com/u/r' }));
    const opLog = new FakeOperationLogService();
    const svc = buildSvc({
      commitAndPush: async () => {
        throw new GitRemoteCreationError('git push failed: remote rejected');
      },
    });
    const useCase = new SyncRepoUseCase(
      repo,
      svc,
      opLog as unknown as ConstructorParameters<typeof SyncRepoUseCase>[2]
    );
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toBeInstanceOf(
      GitRemoteCreationError
    );
    expect(opLog.entries.some((e) => e.level === 'error')).toBe(true);
    expect(opLog.entries.some((e) => e.message.includes('Save & backup failed'))).toBe(true);
  });
});

describe('EnsureGhAuthenticatedUseCase', () => {
  it('returns the service result', async () => {
    const svc: IGitRemoteService = {
      isGhAuthenticated: async () => true,
      createGitHubRepoAndPush: async () => ({ remoteUrl: '' }),
      getStatus: async () => ({
        branch: 'main',
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: true,
        remoteUrl: '',
      }),
      commitAndPush: async () => ({ headSha: 'sha', committed: false, pushed: false }),
    };
    expect(await new EnsureGhAuthenticatedUseCase(svc).execute()).toEqual({
      authenticated: true,
    });
  });
});

describe('InitiateCloudDeploymentUseCase', () => {
  let repo: FakeApplicationRepo;
  let registry: FakeRegistry;
  let fs: FakeFs;
  let bus: FakeEventBus;
  let logger: SilentLogger;

  beforeEach(async () => {
    repo = new FakeApplicationRepo();
    await repo.create(
      makeApp({ cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages })
    );
    registry = new FakeRegistry(
      new Map([[CloudDeploymentProvider.CloudflarePages, makeLiveProvider()]])
    );
    fs = new FakeFs(new Set([path.join('/repo', 'dist')]));
    bus = new FakeEventBus();
    logger = new SilentLogger();
  });

  function buildUseCase() {
    const opLog = new FakeOperationLogService();
    const buildService = { buildProject: async () => undefined };
    return new InitiateCloudDeploymentUseCase(
      repo,
      registry,
      fs,
      bus,
      logger,
      // The fake matches the IOperationLogService shape — duck-typed cast
      // keeps the test free of the heavy generated type imports.
      opLog as unknown as ConstructorParameters<typeof InitiateCloudDeploymentUseCase>[5],
      buildService as unknown as ConstructorParameters<typeof InitiateCloudDeploymentUseCase>[6]
    );
  }

  it('happy path persists Uploading → Deployed and emits events', async () => {
    const useCase = buildUseCase();
    const result = await useCase.execute({ applicationId: 'app-1' });
    expect(result.url).toBe('https://example.pages.dev');

    const finalApp = await repo.findById('app-1');
    expect(finalApp!.cloudDeploymentStatus).toBe(CloudDeploymentStatus.Deployed);
    expect(finalApp!.cloudDeploymentUrl).toBe('https://example.pages.dev');
    expect(finalApp!.cloudDeploymentId).toBe('dep-1');

    const statuses = bus.published.map((e) => e.status);
    expect(statuses).toContain(CloudDeploymentStatus.Uploading);
    expect(statuses).toContain(CloudDeploymentStatus.Deployed);
  });

  it('persists Failed when the provider throws', async () => {
    registry = new FakeRegistry(
      new Map([
        [
          CloudDeploymentProvider.CloudflarePages,
          makeLiveProvider({ deployThrows: new Error('boom') }),
        ],
      ])
    );
    const useCase = buildUseCase();
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toThrow(/boom/);
    const finalApp = await repo.findById('app-1');
    expect(finalApp!.cloudDeploymentStatus).toBe(CloudDeploymentStatus.Failed);
    expect(finalApp!.cloudDeploymentError).toBe('boom');
  });

  it('throws BuildOutputNotFoundError when no build dir exists', async () => {
    fs = new FakeFs(new Set());
    const useCase = buildUseCase();
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toBeInstanceOf(
      BuildOutputNotFoundError
    );
  });

  it('throws NoProviderSelectedError when no provider is set and none is connected', async () => {
    repo = new FakeApplicationRepo();
    await repo.create(makeApp()); // no cloudDeploymentProvider
    // Empty registry — the first-connected fallback finds nothing and the
    // use case surfaces NoProviderSelectedError for the UI to handle.
    registry = new FakeRegistry(new Map());
    const useCase = buildUseCase();
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toBeInstanceOf(
      NoProviderSelectedError
    );
  });

  it('proceeds past the setupComplete flag when it is false (regression — apps with stale setup_complete should still deploy)', async () => {
    // Repro: legacy apps + apps where the orchestrator was killed
    // mid-scaffold end up with `setup_complete: false` forever, but the
    // user has finished the app and wants to deploy. Earlier code
    // gated on this flag and threw ApplicationNotReadyError, blocking
    // an otherwise-valid deploy. The real precondition is "does a
    // build output dir exist", which BuildOutputNotFoundError catches
    // downstream — so the use case must NOT throw ApplicationNotReady
    // for setupComplete=false.
    repo = new FakeApplicationRepo();
    await repo.create(
      makeApp({
        setupComplete: false,
        cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
      })
    );
    const useCase = buildUseCase();
    // Deploy should proceed all the way to completion since the registry
    // still has the live provider stub set up by beforeEach.
    const result = await useCase.execute({ applicationId: 'app-1' });
    expect(result.url).toBe('https://example.pages.dev');
  });

  it('throws CloudProviderNotConnectedError when provider.isConnected is false', async () => {
    registry = new FakeRegistry(
      new Map([[CloudDeploymentProvider.CloudflarePages, makeLiveProvider({ isConnected: false })]])
    );
    const useCase = buildUseCase();
    await expect(useCase.execute({ applicationId: 'app-1' })).rejects.toBeInstanceOf(
      CloudProviderNotConnectedError
    );
  });
});
