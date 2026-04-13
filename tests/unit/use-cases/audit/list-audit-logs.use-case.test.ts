import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAuditLogsUseCase } from '@/application/use-cases/audit/list-audit-logs.use-case.js';
import type { IPmAuditLogRepository } from '@/application/ports/output/repositories/pm-audit-log-repository.interface.js';
import type { PmAuditLog } from '@/domain/generated/output.js';

function createMockAuditRepo(): IPmAuditLogRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
}

function makeEntry(overrides: Partial<PmAuditLog> = {}): PmAuditLog {
  return {
    id: 'entry-1',
    actorId: 'user-1',
    action: 'UserLoggedIn',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PmAuditLog;
}

describe('ListAuditLogsUseCase', () => {
  let useCase: ListAuditLogsUseCase;
  let auditRepo: IPmAuditLogRepository;

  beforeEach(() => {
    auditRepo = createMockAuditRepo();
    useCase = new ListAuditLogsUseCase(auditRepo);
  });

  it('returns entries and total count', async () => {
    const entries = [makeEntry(), makeEntry({ id: 'entry-2' })];
    vi.mocked(auditRepo.list).mockResolvedValue(entries);
    vi.mocked(auditRepo.count).mockResolvedValue(2);

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);
    }
  });

  it('passes filters to repository', async () => {
    await useCase.execute({ actorId: 'user-1', action: 'UserLoggedIn' });

    expect(auditRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1', action: 'UserLoggedIn' })
    );
    expect(auditRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1', action: 'UserLoggedIn' })
    );
  });

  it('works with no filters', async () => {
    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    }
  });
});
