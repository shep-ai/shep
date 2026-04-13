import { injectable, inject } from 'tsyringe';
import type { PmAuditLog } from '../../../domain/generated/output.js';
import type { IPmAuditLogRepository } from '../../ports/output/repositories/pm-audit-log-repository.interface.js';

export interface ListAuditLogsInput {
  actorId?: string;
  action?: string;
  targetId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export type ListAuditLogsResult =
  | { ok: true; entries: PmAuditLog[]; total: number }
  | { ok: false; error: string };

@injectable()
export class ListAuditLogsUseCase {
  constructor(@inject('IPmAuditLogRepository') private readonly auditRepo: IPmAuditLogRepository) {}

  async execute(input: ListAuditLogsInput = {}): Promise<ListAuditLogsResult> {
    const filters = {
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      limit: input.limit,
      offset: input.offset,
    };

    const [entries, total] = await Promise.all([
      this.auditRepo.list(filters),
      this.auditRepo.count(filters),
    ]);

    return { ok: true, entries, total };
  }
}
