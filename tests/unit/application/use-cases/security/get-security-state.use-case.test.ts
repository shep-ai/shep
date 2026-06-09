/**
 * GetSecurityStateUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetSecurityStateUseCase } from '@/application/use-cases/security/get-security-state.use-case.js';
import {
  SecurityMode,
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import type { SecurityEvent, Settings } from '@/domain/generated/output.js';
import type { ISecurityEventRepository } from '@/application/ports/output/repositories/security-event.repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

function createTestEvent(overrides?: Partial<SecurityEvent>): SecurityEvent {
  return {
    id: 'evt-1',
    repositoryPath: '/repo',
    severity: SecuritySeverity.Medium,
    category: SecurityActionCategory.DependencyInstall,
    disposition: SecurityActionDisposition.Denied,
    message: 'Test finding',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GetSecurityStateUseCase', () => {
  let useCase: GetSecurityStateUseCase;
  let eventRepo: ISecurityEventRepository;
  let settingsRepo: ISettingsRepository;

  beforeEach(() => {
    eventRepo = {
      save: vi.fn(),
      findByRepository: vi.fn().mockResolvedValue([]),
      findByFeature: vi.fn().mockResolvedValue([]),
      deleteOlderThan: vi.fn().mockResolvedValue(0),
      count: vi.fn().mockResolvedValue(0),
    };

    settingsRepo = {
      initialize: vi.fn(),
      load: vi.fn().mockResolvedValue({
        id: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        security: {
          mode: SecurityMode.Advisory,
          lastEvaluationAt: '2024-01-01T00:00:00.000Z',
          policySource: 'shep.security.yaml',
        },
      } as unknown as Settings),
      update: vi.fn(),
    };

    useCase = new GetSecurityStateUseCase(eventRepo, settingsRepo);
  });

  it('should return empty events array and null highest finding when no events exist', async () => {
    const state = await useCase.execute('/repo');

    expect(state.mode).toBe(SecurityMode.Advisory);
    expect(state.recentEvents).toHaveLength(0);
    expect(state.highestSeverityFinding).toBeNull();
    expect(state.lastEvaluationAt).toBe('2024-01-01T00:00:00.000Z');
    expect(state.policySource).toBe('shep.security.yaml');
  });

  it('should return recent events with correct limit', async () => {
    const events = [
      createTestEvent({ id: 'evt-1', severity: SecuritySeverity.Low }),
      createTestEvent({ id: 'evt-2', severity: SecuritySeverity.High }),
      createTestEvent({ id: 'evt-3', severity: SecuritySeverity.Medium }),
    ];
    vi.mocked(eventRepo.findByRepository).mockResolvedValue(events);

    const state = await useCase.execute('/repo');

    expect(state.recentEvents).toHaveLength(3);
    expect(eventRepo.findByRepository).toHaveBeenCalledWith('/repo', { limit: 20 });
  });

  it('should return highest severity finding from recent events', async () => {
    const events = [
      createTestEvent({ id: 'evt-1', severity: SecuritySeverity.Low }),
      createTestEvent({ id: 'evt-2', severity: SecuritySeverity.Critical }),
      createTestEvent({ id: 'evt-3', severity: SecuritySeverity.High }),
    ];
    vi.mocked(eventRepo.findByRepository).mockResolvedValue(events);

    const state = await useCase.execute('/repo');

    expect(state.highestSeverityFinding).toBeDefined();
    expect(state.highestSeverityFinding!.id).toBe('evt-2');
    expect(state.highestSeverityFinding!.severity).toBe(SecuritySeverity.Critical);
  });

  it('should return default mode when settings have no security config', async () => {
    vi.mocked(settingsRepo.load).mockResolvedValue({
      id: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Settings);

    const state = await useCase.execute('/repo');

    expect(state.mode).toBe(SecurityMode.Advisory);
    expect(state.lastEvaluationAt).toBeNull();
    expect(state.policySource).toBeNull();
  });
});
