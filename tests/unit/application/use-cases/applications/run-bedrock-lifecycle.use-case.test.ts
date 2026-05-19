import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunBedrockLifecycleUseCase } from '@/application/use-cases/applications/run-bedrock-lifecycle.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type {
  IBedrockIntegrationService,
  BedrockLifecycleResult,
} from '@/application/ports/output/services/bedrock-integration.service.js';
import { ApplicationStatus, BedrockLifecycleAction } from '@/domain/generated/output.js';
import type { Application } from '@/domain/generated/output.js';
import { BedrockNotEnabledError } from '@/domain/errors/bedrock-not-enabled.error.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';

const APP_ID = 'app-456';
const REPO_PATH = '/home/user/lifecycle-repo';

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    name: 'Lifecycle App',
    slug: 'lifecycle-app',
    description: 'A lifecycle app',
    repositoryPath: REPO_PATH,
    additionalPaths: [],
    status: ApplicationStatus.Active,
    setupComplete: true,
    bedrockEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Application;
}

function makeResult(action: BedrockLifecycleAction): BedrockLifecycleResult {
  return { action, stdout: 'ok', stderr: '', exitCode: 0 };
}

function createMockAppRepo(app: Application | null): IApplicationRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(app),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBedrockService(): IBedrockIntegrationService {
  return {
    init: vi.fn().mockResolvedValue(makeResult(BedrockLifecycleAction.Init)),
    sync: vi.fn().mockResolvedValue(makeResult(BedrockLifecycleAction.Sync)),
    ship: vi.fn().mockResolvedValue(makeResult(BedrockLifecycleAction.Ship)),
    doctor: vi.fn(),
  } as unknown as IBedrockIntegrationService;
}

describe('RunBedrockLifecycleUseCase', () => {
  let appRepo: IApplicationRepository;
  let bedrock: IBedrockIntegrationService;
  let useCase: RunBedrockLifecycleUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    appRepo = createMockAppRepo(makeApplication());
    bedrock = createMockBedrockService();
    useCase = new RunBedrockLifecycleUseCase(appRepo, bedrock);
  });

  it('dispatches Init to bedrock.init()', async () => {
    const result = await useCase.execute({
      applicationId: APP_ID,
      action: BedrockLifecycleAction.Init,
    });

    expect(bedrock.init).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }));
    expect(bedrock.sync).not.toHaveBeenCalled();
    expect(bedrock.ship).not.toHaveBeenCalled();
    expect(result.action).toBe(BedrockLifecycleAction.Init);
  });

  it('dispatches Sync to bedrock.sync()', async () => {
    const result = await useCase.execute({
      applicationId: APP_ID,
      action: BedrockLifecycleAction.Sync,
    });

    expect(bedrock.sync).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }));
    expect(bedrock.init).not.toHaveBeenCalled();
    expect(bedrock.ship).not.toHaveBeenCalled();
    expect(result.action).toBe(BedrockLifecycleAction.Sync);
  });

  it('dispatches Ship to bedrock.ship()', async () => {
    const result = await useCase.execute({
      applicationId: APP_ID,
      action: BedrockLifecycleAction.Ship,
    });

    expect(bedrock.ship).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }));
    expect(bedrock.init).not.toHaveBeenCalled();
    expect(bedrock.sync).not.toHaveBeenCalled();
    expect(result.action).toBe(BedrockLifecycleAction.Ship);
  });

  it('forwards onProgress callback to the dispatched port method', async () => {
    const onProgress = vi.fn();
    await useCase.execute({
      applicationId: APP_ID,
      action: BedrockLifecycleAction.Sync,
      onProgress,
    });

    expect(bedrock.sync).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: REPO_PATH, onProgress })
    );
  });

  it('throws BedrockNotEnabledError when application has bedrockEnabled=false', async () => {
    appRepo = createMockAppRepo(makeApplication({ bedrockEnabled: false }));
    useCase = new RunBedrockLifecycleUseCase(appRepo, bedrock);

    await expect(
      useCase.execute({ applicationId: APP_ID, action: BedrockLifecycleAction.Sync })
    ).rejects.toBeInstanceOf(BedrockNotEnabledError);
    expect(bedrock.sync).not.toHaveBeenCalled();
  });

  it('throws ApplicationNotFoundError when application is missing', async () => {
    appRepo = createMockAppRepo(null);
    useCase = new RunBedrockLifecycleUseCase(appRepo, bedrock);

    await expect(
      useCase.execute({ applicationId: 'missing', action: BedrockLifecycleAction.Init })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
    expect(bedrock.init).not.toHaveBeenCalled();
  });
});
