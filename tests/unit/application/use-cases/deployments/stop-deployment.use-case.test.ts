import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StopDeploymentUseCase } from '@/application/use-cases/deployments/stop-deployment.use-case.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';

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

describe('StopDeploymentUseCase', () => {
  let service: IDeploymentService;
  let useCase: StopDeploymentUseCase;

  beforeEach(() => {
    service = createService();
    useCase = new StopDeploymentUseCase(service);
  });

  it('rejects an empty targetId', async () => {
    await expect(useCase.execute('')).rejects.toThrow(/targetId/i);
    await expect(useCase.execute('   ')).rejects.toThrow(/targetId/i);
  });

  it('delegates to deploymentService.stop with the given targetId', async () => {
    await useCase.execute('feat-1');
    expect(service.stop).toHaveBeenCalledWith('feat-1');
  });

  it('propagates errors from the underlying service', async () => {
    vi.mocked(service.stop).mockRejectedValue(new Error('kill failed'));
    await expect(useCase.execute('feat-1')).rejects.toThrow('kill failed');
  });
});
