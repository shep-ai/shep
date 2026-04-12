import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartRepositoryDeploymentUseCase } from '@/application/use-cases/deployments/start-repository-deployment.use-case.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '@/application/ports/output/services/shep-instance-service.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';

function createDeps() {
  const deploymentService: IDeploymentService = {
    setDatabase: vi.fn(),
    recoverAll: vi.fn(),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(null),
    listAll: vi.fn().mockReturnValue([]),
    stopAll: vi.fn(),
    getLogs: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
  };

  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockReturnValue(true),
  };

  const shepInstance: IShepInstanceService = {
    isSameInstance: vi.fn().mockReturnValue(false),
  };

  return { deploymentService, fileSystem, shepInstance };
}

describe('StartRepositoryDeploymentUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: StartRepositoryDeploymentUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new StartRepositoryDeploymentUseCase(
      deps.deploymentService,
      deps.fileSystem,
      deps.shepInstance
    );
  });

  it('rejects an empty or non-absolute repositoryPath', async () => {
    await expect(useCase.execute('')).rejects.toThrow(/absolute/i);
    await expect(useCase.execute('relative/path')).rejects.toThrow(/absolute/i);
  });

  it('throws when the repository directory does not exist', async () => {
    vi.mocked(deps.fileSystem.pathExists).mockReturnValue(false);
    await expect(useCase.execute('/repos/demo')).rejects.toThrow(/does not exist/i);
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
  });

  it('rejects the running shep instance repository', async () => {
    vi.mocked(deps.shepInstance.isSameInstance).mockReturnValue(true);
    await expect(useCase.execute('/repos/demo')).rejects.toThrow(/shep/i);
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
  });

  it('starts the deployment with targetType=repository and returns Booting state', async () => {
    const result = await useCase.execute('/repos/demo');

    expect(deps.deploymentService.start).toHaveBeenCalledWith(
      '/repos/demo',
      '/repos/demo',
      'repository'
    );
    expect(result).toEqual({ state: DeploymentState.Booting, url: null });
  });
});
