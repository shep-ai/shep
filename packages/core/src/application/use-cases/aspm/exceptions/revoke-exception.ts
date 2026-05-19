/**
 * RevokeExceptionUseCase (feature 098, phase 6, task-36).
 *
 * Transitions an Active RiskException to Revoked and appends an audit
 * entry. Refuses to revoke an exception that is already Expired or
 * Revoked. Throws ExceptionExpiredError when the exception's expiry has
 * already passed (callers must declare a fresh exception instead).
 */

import { inject, injectable } from 'tsyringe';
import { RiskExceptionStatus } from '../../../../domain/generated/output.js';
import { ExceptionExpiredError } from '../../../../domain/aspm/errors/exception-expired.error.js';
import { AUDIT_ACTIONS, buildAuditEntry } from '../../../../domain/aspm/exceptions/audit-entry.js';
import type { IRiskExceptionRepository } from '../../../ports/output/repositories/risk-exception-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface RevokeExceptionInput {
  exceptionId: string;
  revokedBy: string;
  note?: string;
}

@injectable()
export class RevokeExceptionUseCase {
  constructor(
    @inject('IRiskExceptionRepository')
    private readonly exceptionRepo: IRiskExceptionRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: RevokeExceptionInput): Promise<void> {
    const existing = await this.exceptionRepo.findById(input.exceptionId);
    if (existing === null) {
      throw new Error(`RiskException ${input.exceptionId} not found`);
    }

    if (existing.status !== RiskExceptionStatus.Active) {
      throw new Error(
        `RiskException ${input.exceptionId} is ${existing.status} — only Active exceptions can be revoked`
      );
    }

    const now = this.clock.now();
    const expiresAtMs = (existing.expiresAt as Date).getTime();
    if (expiresAtMs <= now.getTime()) {
      throw new ExceptionExpiredError(existing.id, (existing.expiresAt as Date).toISOString());
    }

    await this.exceptionRepo.updateStatus(
      existing.id,
      RiskExceptionStatus.Revoked,
      buildAuditEntry({
        now,
        actor: input.revokedBy,
        action: AUDIT_ACTIONS.Revoked,
        note: input.note,
      })
    );
  }
}
