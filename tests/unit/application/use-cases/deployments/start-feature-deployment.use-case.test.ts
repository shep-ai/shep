import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartFeatureDeploymentUseCase } from '@/application/use-cases/deployments/start-feature-deployment.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IDevServerAgentService } from '@/application/ports/output/services/dev-server-agent-service.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '@/application/ports/output/services/shep-instance-service.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import {
  DeploymentState,
  SdlcLifecycle,
  type Feature,
  BuildMode,
} from '@/domain/generated/output.js';

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-1',
    name: 'Demo',
    slug: 'demo',
    description: 'desc',
    userQuery: 'query',
    repositoryPath: '/repos/demo',
    branch: 'feat/demo',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createDeps() {
  const featureRepo: IFeatureRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdPrefix: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByBranch: vi.fn().mockResolvedValue(null),
    findByWorktreePath: vi.fn().mockResolvedValue(null),
    findByParentId: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  } as unknown as IFeatureRepository;

  const devServerAgent: IDevServerAgentService = {
    startDevServer: vi.fn().mockResolvedValue({ state: DeploymentState.Analyzing }),
  };

  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockReturnValue(true),
  };

  const shepInstance: IShepInstanceService = {
    isSameInstance: vi.fn().mockReturnValue(false),
  };

  const worktreePaths: IWorktreePathProvider = {
    getWorktreePath: vi.fn(
      (repo: string, branch: string) => `/tmp/fake-worktree/${repo}/${branch}`
    ),
  };

  return { featureRepo, devServerAgent, fileSystem, shepInstance, worktreePaths };
}

describe('StartFeatureDeploymentUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: StartFeatureDeploymentUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new StartFeatureDeploymentUseCase(
      deps.featureRepo,
      deps.devServerAgent,
      deps.fileSystem,
      deps.shepInstance,
      deps.worktreePaths
    );
  });

  it('rejects an empty featureId', async () => {
    await expect(useCase.execute('')).rejects.toThrow(/featureId/i);
    await expect(useCase.execute('   ')).rejects.toThrow(/featureId/i);
  });

  it('throws when the feature is not found', async () => {
    vi.mocked(deps.featureRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toThrow(/not found/i);
  });

  it('throws when the worktree path does not exist on disk', async () => {
    vi.mocked(deps.featureRepo.findById).mockResolvedValue(makeFeature());
    vi.mocked(deps.fileSystem.pathExists).mockReturnValue(false);

    await expect(useCase.execute('feat-1')).rejects.toThrow(/worktree/i);
    expect(deps.devServerAgent.startDevServer).not.toHaveBeenCalled();
  });

  it('rejects features that belong to the running shep instance', async () => {
    vi.mocked(deps.featureRepo.findById).mockResolvedValue(makeFeature());
    vi.mocked(deps.shepInstance.isSameInstance).mockReturnValue(true);

    await expect(useCase.execute('feat-1')).rejects.toThrow(/shep/i);
    expect(deps.devServerAgent.startDevServer).not.toHaveBeenCalled();
  });

  it('delegates to the dev-server agent and returns its state with url null', async () => {
    const feature = makeFeature({ id: 'feat-1', repositoryPath: '/repos/demo', branch: 'feat/x' });
    vi.mocked(deps.featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute('feat-1');

    expect(deps.devServerAgent.startDevServer).toHaveBeenCalledWith(
      'feat-1',
      expect.any(String),
      'feature'
    );
    expect(result).toEqual({ state: DeploymentState.Analyzing, url: null });
  });

  it('checks same-shep-instance against the feature repositoryPath, not the worktree path', async () => {
    const feature = makeFeature({ repositoryPath: '/repos/demo' });
    vi.mocked(deps.featureRepo.findById).mockResolvedValue(feature);

    await useCase.execute('feat-1');

    expect(deps.shepInstance.isSameInstance).toHaveBeenCalledWith('/repos/demo');
  });
});
