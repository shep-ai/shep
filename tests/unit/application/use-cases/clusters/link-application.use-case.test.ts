import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkApplicationUseCase } from '@/application/use-cases/clusters/link-application.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { Cluster, Application, ClusterApplication } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';

function createMockClusterRepo(): IClusterRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    linkRepository: vi.fn(),
    unlinkRepository: vi.fn(),
    getLinkedRepositories: vi.fn().mockResolvedValue([]),
    linkApplication: vi.fn(),
    unlinkApplication: vi.fn(),
    getLinkedApplications: vi.fn().mockResolvedValue([]),
  };
}

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

const sampleCluster: Cluster = {
  id: 'cluster-1',
  name: 'Test Cluster',
  slug: 'test-cluster',
  status: ClusterStatus.Stopped,
  argoCdEnabled: false,
  argoCdNamespace: 'argocd',
  nodeCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleApp: Application = {
  id: 'app-1',
  name: 'My App',
  slug: 'my-app',
  description: 'Test application',
  repositoryPath: '/apps/my-app',
  additionalPaths: [],
  status: 'Active' as any,
  setupComplete: true,
  bedrockEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('LinkApplicationUseCase', () => {
  let useCase: LinkApplicationUseCase;
  let mockClusterRepo: IClusterRepository;
  let mockAppRepo: IApplicationRepository;

  beforeEach(() => {
    mockClusterRepo = createMockClusterRepo();
    mockAppRepo = createMockAppRepo();
    useCase = new LinkApplicationUseCase(mockClusterRepo, mockAppRepo);
  });

  it('should link application to cluster', async () => {
    vi.mocked(mockClusterRepo.findById).mockResolvedValue(sampleCluster);
    vi.mocked(mockAppRepo.findById).mockResolvedValue(sampleApp);
    const mockLink: ClusterApplication = {
      id: 'link-1',
      clusterId: 'cluster-1',
      applicationId: 'app-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(mockClusterRepo.linkApplication).mockResolvedValue(mockLink);

    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'app-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.link).toEqual(mockLink);
    expect(mockClusterRepo.linkApplication).toHaveBeenCalledWith('cluster-1', 'app-1');
  });

  it('should return error when cluster not found', async () => {
    vi.mocked(mockAppRepo.findById).mockResolvedValue(sampleApp);

    const result = await useCase.execute({ clusterId: 'non-existent', entityId: 'app-1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });

  it('should return error when application not found', async () => {
    vi.mocked(mockClusterRepo.findById).mockResolvedValue(sampleCluster);

    const result = await useCase.execute({ clusterId: 'cluster-1', entityId: 'non-existent' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Application not found: "non-existent"');
  });
});
