import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckBedrockHealthUseCase } from '@/application/use-cases/applications/check-bedrock-health.use-case.js';
import type { IBedrockIntegrationService } from '@/application/ports/output/services/bedrock-integration.service.js';
import type { BedrockHealth } from '@/domain/generated/output.js';

function createMockBedrockService(
  doctorImpl?: () => Promise<BedrockHealth>
): IBedrockIntegrationService {
  return {
    init: vi.fn(),
    sync: vi.fn(),
    ship: vi.fn(),
    doctor: vi.fn().mockImplementation(
      doctorImpl ??
        (() =>
          Promise.resolve({
            python: { tier: 'python3', status: 'ok', detail: '3.11.4' },
            pipx: { tier: 'pipx', status: 'ok', detail: '1.4.3' },
            bedrock: { tier: 'bedrock', status: 'ok', detail: '0.2.1' },
            overall: 'ok',
          }))
    ),
  } as unknown as IBedrockIntegrationService;
}

describe('CheckBedrockHealthUseCase', () => {
  let bedrock: IBedrockIntegrationService;
  let useCase: CheckBedrockHealthUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    bedrock = createMockBedrockService();
    useCase = new CheckBedrockHealthUseCase(bedrock);
  });

  it('returns the BedrockHealth returned by doctor()', async () => {
    const result = await useCase.execute();

    expect(bedrock.doctor).toHaveBeenCalledOnce();
    expect(result.overall).toBe('ok');
    expect(result.python.status).toBe('ok');
    expect(result.pipx.status).toBe('ok');
    expect(result.bedrock.status).toBe('ok');
  });

  it('returns a degraded health report verbatim without transformation', async () => {
    bedrock = createMockBedrockService(() =>
      Promise.resolve({
        python: { tier: 'python3', status: 'ok', detail: '3.11.4' },
        pipx: { tier: 'pipx', status: 'missing', remediation: 'install pipx' },
        bedrock: { tier: 'bedrock', status: 'missing', remediation: 'install bedrock' },
        overall: 'missing',
      })
    );
    useCase = new CheckBedrockHealthUseCase(bedrock);

    const result = await useCase.execute();

    expect(result.overall).toBe('missing');
    expect(result.pipx.status).toBe('missing');
    expect(result.pipx.remediation).toBe('install pipx');
  });

  it('propagates errors thrown by doctor()', async () => {
    bedrock = createMockBedrockService(() => Promise.reject(new Error('probe crashed')));
    useCase = new CheckBedrockHealthUseCase(bedrock);

    await expect(useCase.execute()).rejects.toThrow('probe crashed');
  });
});
