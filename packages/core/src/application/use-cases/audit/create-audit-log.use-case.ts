import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmAuditLog, AuditAction } from '../../../domain/generated/output.js';
import type { IPmAuditLogRepository } from '../../ports/output/repositories/pm-audit-log-repository.interface.js';

export interface CreateAuditLogInput {
  actorId: string;
  action: AuditAction;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export type CreateAuditLogResult = { ok: true; entry: PmAuditLog } | { ok: false; error: string };

@injectable()
export class CreateAuditLogUseCase {
  constructor(@inject('IPmAuditLogRepository') private readonly auditRepo: IPmAuditLogRepository) {}

  async execute(input: CreateAuditLogInput): Promise<CreateAuditLogResult> {
    if (!input.actorId) {
      return { ok: false, error: 'Actor ID is required.' };
    }

    if (!input.action) {
      return { ok: false, error: 'Action is required.' };
    }

    const now = new Date();
    const entry: PmAuditLog = {
      id: randomUUID(),
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId,
      targetType: input.targetType,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      ipAddress: input.ipAddress,
      createdAt: now,
      updatedAt: now,
    };

    await this.auditRepo.create(entry);
    return { ok: true, entry };
  }
}
