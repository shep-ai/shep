import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateClusterUseCase } from '@/application/use-cases/clusters/create-cluster.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
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

describe('CreateClusterUseCase', () => {
  let useCase: CreateClusterUseCase;
  let mockRepo: IClusterRepository;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    useCase = new CreateClusterUseCase(mockRepo);
  });

  it('should create a cluster with Stopped status and generated slug', async () => {
    const result = await useCase.execute({ name: 'My Cluster' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster.name).toBe('My Cluster');
    expect(result.cluster.slug).toBe('my-cluster');
    expect(result.cluster.status).toBe(ClusterStatus.Stopped);
    expect(result.cluster.argoCdEnabled).toBe(false);
    expect(result.cluster.nodeCount).toBe(1);
    expect(result.cluster.id).toBeDefined();
    expect(mockRepo.create).toHaveBeenCalledWith(result.cluster);
  });

  it('should create a cluster with ArgoCD enabled', async () => {
    const result = await useCase.execute({
      name: 'Production',
      argoCdEnabled: true,
      argoCdNamespace: 'custom-argocd',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster.argoCdEnabled).toBe(true);
    expect(result.cluster.argoCdNamespace).toBe('custom-argocd');
  });

  it('should create a cluster with description', async () => {
    const result = await useCase.execute({
      name: 'Staging',
      description: 'Staging environment',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster.description).toBe('Staging environment');
  });

  it('should reject empty name', async () => {
    const result = await useCase.execute({ name: '  ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster name is required.');
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('should trim the name', async () => {
    const result = await useCase.execute({ name: '  My Cluster  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cluster.name).toBe('My Cluster');
  });
});
