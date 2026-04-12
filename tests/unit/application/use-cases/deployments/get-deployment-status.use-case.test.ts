import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDeploymentStatusUseCase } from '@/application/use-cases/deployments/get-deployment-status.use-case.js';
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

describe('GetDeploymentStatusUseCase', () => {
  let service: IDeploymentService;
  let useCase: GetDeploymentStatusUseCase;

  beforeEach(() => {
    service = createService();
    useCase = new GetDeploymentStatusUseCase(service);
  });

  it('returns null for an empty targetId without calling the service', async () => {
    const result = await useCase.execute('');
    expect(result).toBeNull();
    expect(service.getStatus).not.toHaveBeenCalled();
  });

  it('returns the status from deploymentService.getStatus', async () => {
    vi.mocked(service.getStatus).mockReturnValue({
      state: DeploymentState.Ready,
      url: 'http://localhost:3000',
    });

    const result = await useCase.execute('feat-1');

    expect(service.getStatus).toHaveBeenCalledWith('feat-1');
    expect(result).toEqual({ state: DeploymentState.Ready, url: 'http://localhost:3000' });
  });

  it('returns null when no deployment exists for the target', async () => {
    vi.mocked(service.getStatus).mockReturnValue(null);
    const result = await useCase.execute('unknown');
    expect(result).toBeNull();
  });
});
