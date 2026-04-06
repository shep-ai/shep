import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateApplicationUseCase } from '@/application/use-cases/applications/create-application.use-case.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { CreateProjectUseCase } from '@/application/use-cases/projects/create-project.use-case.js';
import { ApplicationStatus } from '@/domain/generated/output.js';

function createMockAppRepo(): IApplicationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };
}

function createMockCreateProject(): CreateProjectUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      ok: true,
      path: '/shep/projects/rest-api',
    }),
  } as unknown as CreateProjectUseCase;
}

describe('CreateApplicationUseCase', () => {
  let useCase: CreateApplicationUseCase;
  let mockAppRepo: IApplicationRepository;
  let mockCreateProject: CreateProjectUseCase;

  beforeEach(() => {
    mockAppRepo = createMockAppRepo();
    mockCreateProject = createMockCreateProject();
    useCase = new CreateApplicationUseCase(mockAppRepo, mockCreateProject);
  });

  it('creates application with scaffolded project', async () => {
    const result = await useCase.execute({ description: 'Build a REST API for users' });

    // CreateProjectUseCase was called with the resolved unique slug
    expect(mockCreateProject.execute).toHaveBeenCalledWith({
      name: 'rest-api-users',
    });

    // Application was persisted
    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'rest-api-users',
        name: 'Rest Api Users',
        description: 'Build a REST API for users',
        repositoryPath: '/shep/projects/rest-api',
        additionalPaths: [],
        status: ApplicationStatus.Idle,
      })
    );

    expect(result.repositoryPath).toBe('/shep/projects/rest-api');
    expect(result.application.id).toBeDefined();
    expect(result.application.slug).toBe('rest-api-users');
    expect(result.application.name).toBe('Rest Api Users');
  });

  it('passes agent and model overrides through to the application record', async () => {
    const result = await useCase.execute({
      description: 'Chat assistant',
      agentType: 'openai',
      modelOverride: 'gpt-4o',
    });

    expect(result.application.agentType).toBe('openai');
    expect(result.application.modelOverride).toBe('gpt-4o');

    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'openai',
        modelOverride: 'gpt-4o',
      })
    );
  });

  it('appends numeric suffix for duplicate slugs', async () => {
    // First call returns existing (slug taken), second is free
    vi.mocked(mockAppRepo.findBySlug)
      .mockResolvedValueOnce({
        id: 'existing-id',
        name: 'Chat Assistant',
        slug: 'chat-assistant',
        description: 'An existing app',
        repositoryPath: '/shep/projects/chat-assistant',
        additionalPaths: [],
        status: ApplicationStatus.Idle,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce(null); // 'chat-assistant-2' is free

    const result = await useCase.execute({ description: 'Chat assistant' });

    expect(result.application.slug).toBe('chat-assistant-2');
    expect(result.application.name).toBe('Chat Assistant 2');
  });

  it('applies stop-word filtering when building the slug', async () => {
    const result = await useCase.execute({ description: 'Create a dashboard for my team' });

    // "create", "a", "for", "my" are stop words; keeps "dashboard", "team"
    expect(result.application.slug).toBe('dashboard-team');
  });

  it('falls back to "application" slug when all words are stop words', async () => {
    const result = await useCase.execute({ description: 'build create make' });

    expect(result.application.slug).toBe('application');
  });
});
