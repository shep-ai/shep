import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartApplicationDeploymentUseCase } from '@/application/use-cases/deployments/start-application-deployment.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '@/application/ports/output/services/shep-instance-service.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { Application } from '@/domain/generated/output.js';
import { DeploymentState } from '@/domain/generated/output.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';
import { ApplicationRepositoryNotOnDiskError } from '@/domain/errors/application-repository-not-on-disk.error.js';
import { CannotDeploySelfError } from '@/domain/errors/cannot-deploy-self.error.js';

const APP_ID = 'app-uuid-123';
const REPO_PATH = '/workspaces/acme';

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    slug: 'acme',
    repositoryPath: REPO_PATH,
    setupComplete: true,
    bedrockEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Application;
}

function createDeps() {
  const applicationRepo: IApplicationRepository = {
    findById: vi.fn().mockResolvedValue(buildApplication()),
  } as unknown as IApplicationRepository;

  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockReturnValue(true),
  };

  const shepInstance: IShepInstanceService = {
    isSameInstance: vi.fn().mockReturnValue(false),
  };

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

  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return { applicationRepo, fileSystem, shepInstance, deploymentService, logger };
}

describe('StartApplicationDeploymentUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: StartApplicationDeploymentUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new StartApplicationDeploymentUseCase(
      deps.applicationRepo,
      deps.fileSystem,
      deps.shepInstance,
      deps.deploymentService,
      deps.logger
    );
  });

  it('starts the deployment keyed by applicationId with targetType=application and returns Booting state', async () => {
    const result = await useCase.execute({ applicationId: APP_ID });

    expect(deps.applicationRepo.findById).toHaveBeenCalledWith(APP_ID);
    expect(deps.fileSystem.pathExists).toHaveBeenCalledWith(REPO_PATH);
    expect(deps.shepInstance.isSameInstance).toHaveBeenCalledWith(REPO_PATH);
    expect(deps.deploymentService.start).toHaveBeenCalledWith(APP_ID, REPO_PATH, 'application');
    expect(result).toEqual({ state: DeploymentState.Booting });
  });

  it('throws ApplicationNotFoundError when the application does not exist', async () => {
    vi.mocked(deps.applicationRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ applicationId: APP_ID })).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    );
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('throws ApplicationRepositoryNotOnDiskError when the repositoryPath does not exist on disk', async () => {
    vi.mocked(deps.fileSystem.pathExists).mockReturnValue(false);

    await expect(useCase.execute({ applicationId: APP_ID })).rejects.toBeInstanceOf(
      ApplicationRepositoryNotOnDiskError
    );
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('throws CannotDeploySelfError when the target is the running shep instance repository', async () => {
    vi.mocked(deps.shepInstance.isSameInstance).mockReturnValue(true);

    await expect(useCase.execute({ applicationId: APP_ID })).rejects.toBeInstanceOf(
      CannotDeploySelfError
    );
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('rejects an empty applicationId', async () => {
    await expect(useCase.execute({ applicationId: '' })).rejects.toThrow(/required/i);
    expect(deps.deploymentService.start).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalled();
  });
});
