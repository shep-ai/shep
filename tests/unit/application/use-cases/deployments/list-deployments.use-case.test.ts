import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListDeploymentsUseCase } from '@/application/use-cases/deployments/list-deployments.use-case.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';

function createService(): IDeploymentService {
  return {
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
}

describe('ListDeploymentsUseCase', () => {
  let service: IDeploymentService;
  let useCase: ListDeploymentsUseCase;

  beforeEach(() => {
    service = createService();
    useCase = new ListDeploymentsUseCase(service);
  });

  it('returns an empty array when no deployments are tracked', async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('delegates to deploymentService.listAll', async () => {
    vi.mocked(service.listAll).mockReturnValue([
      {
        targetId: 'feat-1',
        targetType: 'feature',
        state: DeploymentState.Ready,
        url: 'http://localhost:3001',
      },
      {
        targetId: '/repos/demo',
        targetType: 'repository',
        state: DeploymentState.Booting,
        url: null,
      },
    ]);

    const result = await useCase.execute();

    expect(service.listAll).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].targetId).toBe('feat-1');
    expect(result[1].state).toBe(DeploymentState.Booting);
  });
});
