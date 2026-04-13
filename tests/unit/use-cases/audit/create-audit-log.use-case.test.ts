import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateAuditLogUseCase } from '@/application/use-cases/audit/create-audit-log.use-case.js';
import type { IPmAuditLogRepository } from '@/application/ports/output/repositories/pm-audit-log-repository.interface.js';
import { AuditAction } from '@/domain/generated/output.js';

function createMockAuditRepo(): IPmAuditLogRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
}

describe('CreateAuditLogUseCase', () => {
  let useCase: CreateAuditLogUseCase;
  let auditRepo: IPmAuditLogRepository;

  beforeEach(() => {
    auditRepo = createMockAuditRepo();
    useCase = new CreateAuditLogUseCase(auditRepo);
  });

  it('creates an audit log entry', async () => {
    const result = await useCase.execute({
      actorId: 'user-1',
      action: AuditAction.UserLoggedIn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.actorId).toBe('user-1');
      expect(result.entry.action).toBe(AuditAction.UserLoggedIn);
      expect(result.entry.id).toBeDefined();
    }
    expect(auditRepo.create).toHaveBeenCalledTimes(1);
  });

  it('creates entry with optional fields', async () => {
    const result = await useCase.execute({
      actorId: 'user-1',
      action: AuditAction.MemberAdded,
      targetId: 'member-1',
      targetType: 'PmProjectMember',
      metadata: { role: 'Admin' },
      ipAddress: '127.0.0.1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.targetId).toBe('member-1');
      expect(result.entry.targetType).toBe('PmProjectMember');
      expect(result.entry.metadata).toBe('{"role":"Admin"}');
      expect(result.entry.ipAddress).toBe('127.0.0.1');
    }
  });

  it('rejects empty actor ID', async () => {
    const result = await useCase.execute({
      actorId: '',
      action: AuditAction.UserLoggedIn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Actor ID');
    }
  });
});
