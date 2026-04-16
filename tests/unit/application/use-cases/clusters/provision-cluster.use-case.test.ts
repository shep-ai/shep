import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProvisionClusterUseCase } from '@/application/use-cases/clusters/provision-cluster.use-case.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { IClusterAgentProcessService } from '@/application/ports/output/services/cluster-agent-process-service.interface.js';
import type { Cluster } from '@/domain/generated/output.js';
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

function createMockProcessService(): IClusterAgentProcessService {
  return {
    spawn: vi.fn().mockReturnValue(12345),
    isAlive: vi.fn().mockReturnValue(true),
    kill: vi.fn(),
  };
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'Test Cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Stopped,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProvisionClusterUseCase', () => {
  let useCase: ProvisionClusterUseCase;
  let mockRepo: IClusterRepository;
  let mockProcess: IClusterAgentProcessService;

  beforeEach(() => {
    mockRepo = createMockClusterRepo();
    mockProcess = createMockProcessService();
    useCase = new ProvisionClusterUseCase(mockRepo, mockProcess);
  });

  it('should provision a Stopped cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster());

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Provisioning,
      errorMessage: undefined,
    });
    expect(mockProcess.spawn).toHaveBeenCalledWith('cluster-1', expect.any(String), {
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
    });
  });

  it('should provision an Error cluster (retry)', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster({ status: ClusterStatus.Error }));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(true);
    expect(mockProcess.spawn).toHaveBeenCalled();
  });

  it('should reject provisioning a Ready cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(makeCluster({ status: ClusterStatus.Ready }));

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('cannot be provisioned from "Ready"');
    expect(mockProcess.spawn).not.toHaveBeenCalled();
  });

  it('should reject provisioning a Provisioning cluster', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeCluster({ status: ClusterStatus.Provisioning })
    );

    const result = await useCase.execute('cluster-1');

    expect(result.ok).toBe(false);
    expect(mockProcess.spawn).not.toHaveBeenCalled();
  });

  it('should return error when cluster not found', async () => {
    const result = await useCase.execute('non-existent');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('Cluster not found: "non-existent"');
  });

  it('should pass ArgoCD options to worker', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(
      makeCluster({ argoCdEnabled: true, argoCdNamespace: 'custom-ns' })
    );

    await useCase.execute('cluster-1');

    expect(mockProcess.spawn).toHaveBeenCalledWith('cluster-1', expect.any(String), {
      argoCdEnabled: true,
      argoCdNamespace: 'custom-ns',
    });
  });
});
