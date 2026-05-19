import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnableBedrockForApplicationUseCase } from '@/application/use-cases/applications/enable-bedrock-for-application.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type {
  IBedrockIntegrationService,
  BedrockLifecycleResult,
} from '@/application/ports/output/services/bedrock-integration.service.js';
import { ApplicationStatus, BedrockLifecycleAction } from '@/domain/generated/output.js';
import type { Application } from '@/domain/generated/output.js';

const APP_ID = 'app-123';
const REPO_PATH = '/home/user/repo';

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    name: 'Test App',
    slug: 'test-app',
    description: 'A test application',
    repositoryPath: REPO_PATH,
    additionalPaths: [],
    status: ApplicationStatus.Active,
    setupComplete: true,
    bedrockEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Application;
}

function makeInitResult(): BedrockLifecycleResult {
  return {
    action: BedrockLifecycleAction.Init,
    stdout: 'bedrock initialised',
    stderr: '',
    exitCode: 0,
  };
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

function createMockBedrockService(
  initImpl?: () => Promise<BedrockLifecycleResult>
): IBedrockIntegrationService {
  return {
    init: vi.fn().mockImplementation(initImpl ?? (() => Promise.resolve(makeInitResult()))),
    sync: vi.fn().mockResolvedValue(makeInitResult()),
    ship: vi.fn().mockResolvedValue(makeInitResult()),
    doctor: vi.fn(),
  } as unknown as IBedrockIntegrationService;
}

describe('EnableBedrockForApplicationUseCase', () => {
  let appRepo: IApplicationRepository;
  let bedrock: IBedrockIntegrationService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists bedrockEnabled=true and runs init on first enable', async () => {
    const app = makeApplication({ bedrockEnabled: false });
    appRepo = createMockAppRepo(app);
    bedrock = createMockBedrockService();
    const useCase = new EnableBedrockForApplicationUseCase(appRepo, bedrock);

    const result = await useCase.execute({ applicationId: APP_ID });

    expect(appRepo.findById).toHaveBeenCalledWith(APP_ID);
    expect(appRepo.update).toHaveBeenCalledWith(APP_ID, { bedrockEnabled: true });
    expect(bedrock.init).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }));
    expect(result.action).toBe(BedrockLifecycleAction.Init);
    expect(result.exitCode).toBe(0);
  });

  it('skips persistence but re-runs init on second enable (idempotent)', async () => {
    const app = makeApplication({ bedrockEnabled: true });
    appRepo = createMockAppRepo(app);
    bedrock = createMockBedrockService();
    const useCase = new EnableBedrockForApplicationUseCase(appRepo, bedrock);

    const result = await useCase.execute({ applicationId: APP_ID });

    expect(appRepo.update).not.toHaveBeenCalled();
    expect(bedrock.init).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }));
    expect(result.action).toBe(BedrockLifecycleAction.Init);
  });

  it('forwards onProgress callback to the bedrock service', async () => {
    const app = makeApplication({ bedrockEnabled: true });
    appRepo = createMockAppRepo(app);
    bedrock = createMockBedrockService();
    const useCase = new EnableBedrockForApplicationUseCase(appRepo, bedrock);

    const onProgress = vi.fn();
    await useCase.execute({ applicationId: APP_ID, onProgress });

    expect(bedrock.init).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: REPO_PATH, onProgress })
    );
  });

  it('bubbles a typed error when init fails', async () => {
    const app = makeApplication({ bedrockEnabled: false });
    appRepo = createMockAppRepo(app);
    bedrock = createMockBedrockService(() => Promise.reject(new Error('bedrock not found')));
    const useCase = new EnableBedrockForApplicationUseCase(appRepo, bedrock);

    await expect(useCase.execute({ applicationId: APP_ID })).rejects.toThrow('bedrock not found');
  });

  it('throws when the application does not exist', async () => {
    appRepo = createMockAppRepo(null);
    bedrock = createMockBedrockService();
    const useCase = new EnableBedrockForApplicationUseCase(appRepo, bedrock);

    await expect(useCase.execute({ applicationId: 'missing' })).rejects.toThrow();
    expect(appRepo.update).not.toHaveBeenCalled();
    expect(bedrock.init).not.toHaveBeenCalled();
  });
});
