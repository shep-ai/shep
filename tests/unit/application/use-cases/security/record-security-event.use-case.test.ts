/**
 * RecordSecurityEventUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordSecurityEventUseCase } from '@/application/use-cases/security/record-security-event.use-case.js';
import {
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import type { SecurityEvent } from '@/domain/generated/output.js';
import type { ISecurityEventRepository } from '@/application/ports/output/repositories/security-event.repository.interface.js';

function createTestEvent(overrides?: Partial<SecurityEvent>): SecurityEvent {
  return {
    id: '',
    repositoryPath: '/repo',
    severity: SecuritySeverity.High,
    category: SecurityActionCategory.DependencyInstall,
    disposition: SecurityActionDisposition.Denied,
    message: 'Test event',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RecordSecurityEventUseCase', () => {
  let useCase: RecordSecurityEventUseCase;
  let eventRepo: ISecurityEventRepository;

  beforeEach(() => {
    eventRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findByRepository: vi.fn().mockResolvedValue([]),
      findByFeature: vi.fn().mockResolvedValue([]),
      deleteOlderThan: vi.fn().mockResolvedValue(0),
      count: vi.fn().mockResolvedValue(0),
    };

    useCase = new RecordSecurityEventUseCase(eventRepo);
  });

  it('should save event with generated ID when no ID provided', async () => {
    const event = createTestEvent({ id: '' });

    await useCase.execute(event);

    expect(eventRepo.save).toHaveBeenCalledTimes(1);
    const savedEvent = vi.mocked(eventRepo.save).mock.calls[0][0];
    expect(savedEvent.id).toBeTruthy();
    expect(savedEvent.id).not.toBe('');
  });

  it('should preserve existing ID when provided', async () => {
    const event = createTestEvent({ id: 'existing-id' });

    await useCase.execute(event);

    const savedEvent = vi.mocked(eventRepo.save).mock.calls[0][0];
    expect(savedEvent.id).toBe('existing-id');
  });

  it('should trigger retention cleanup after save', async () => {
    const event = createTestEvent();

    await useCase.execute(event);

    expect(eventRepo.deleteOlderThan).toHaveBeenCalledTimes(1);
    const cutoff = vi.mocked(eventRepo.deleteOlderThan).mock.calls[0][0];
    // Cutoff should be approximately 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const diff = Math.abs(cutoff.getTime() - ninetyDaysAgo.getTime());
    expect(diff).toBeLessThan(5000); // Within 5 seconds
  });
});
