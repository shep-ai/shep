import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartRepositoryDeploymentUseCase } from '@/application/use-cases/deployments/start-repository-deployment.use-case.js';
import type { IDevServerAgentService } from '@/application/ports/output/services/dev-server-agent-service.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '@/application/ports/output/services/shep-instance-service.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';

function createDeps() {
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

  return { devServerAgent, fileSystem, shepInstance };
}

describe('StartRepositoryDeploymentUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: StartRepositoryDeploymentUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new StartRepositoryDeploymentUseCase(
      deps.devServerAgent,
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
    expect(deps.devServerAgent.startDevServer).not.toHaveBeenCalled();
  });

  it('rejects the running shep instance repository', async () => {
    vi.mocked(deps.shepInstance.isSameInstance).mockReturnValue(true);
    await expect(useCase.execute('/repos/demo')).rejects.toThrow(/shep/i);
    expect(deps.devServerAgent.startDevServer).not.toHaveBeenCalled();
  });

  it('delegates to the dev-server agent with targetType=repository and returns its state with url null', async () => {
    const result = await useCase.execute('/repos/demo');

    expect(deps.devServerAgent.startDevServer).toHaveBeenCalledWith(
      '/repos/demo',
      '/repos/demo',
      'repository'
    );
    expect(result).toEqual({ state: DeploymentState.Analyzing, url: null });
  });
});
