/**
 * DeclareExceptionUseCase (feature 098, phase 6, task-36).
 *
 * Declares a self-declared RiskException on a finding. Validates that the
 * finding exists, the expiry is in the future, the justification is
 * non-empty, and there is no other Active exception already in flight
 * (FR-22, FR-23).
 *
 * The repository's partial unique index also enforces the "one active
 * per finding" invariant — this guard surfaces a typed domain error
 * before SQLite throws.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  ExceptionReason,
  RiskExceptionStatus,
  type RiskException,
} from '../../../../domain/generated/output.js';
import { FindingNotFoundError } from '../../../../domain/aspm/errors/finding-not-found.error.js';
import { ExceptionAlreadyActiveError } from '../../../../domain/aspm/errors/exception-already-active.error.js';
import { AUDIT_ACTIONS, buildAuditEntry } from '../../../../domain/aspm/exceptions/audit-entry.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IRiskExceptionRepository } from '../../../ports/output/repositories/risk-exception-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface DeclareExceptionInput {
  findingId: string;
  reason: ExceptionReason;
  justification: string;
  declaredBy: string;
  expiresAt: Date;
}

@injectable()
export class DeclareExceptionUseCase {
  constructor(
    @inject('IRiskExceptionRepository')
    private readonly exceptionRepo: IRiskExceptionRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: DeclareExceptionInput): Promise<RiskException> {
    const trimmedJustification = input.justification.trim();
    if (trimmedJustification.length === 0) {
      throw new Error('RiskException justification cannot be empty');
    }

    const now = this.clock.now();
    if (input.expiresAt.getTime() <= now.getTime()) {
      throw new Error(
        `RiskException expiresAt (${input.expiresAt.toISOString()}) must be in the future`
      );
    }

    const finding = await this.findingRepo.findById(input.findingId);
    if (finding === null) throw new FindingNotFoundError(input.findingId);

    const existing = await this.exceptionRepo.findActiveForFinding(input.findingId);
    if (existing !== null) {
      throw new ExceptionAlreadyActiveError(input.findingId, existing.id);
    }

    const exception: RiskException = {
      id: randomUUID(),
      findingId: input.findingId,
      reason: input.reason,
      justification: trimmedJustification,
      declaredBy: input.declaredBy,
      declaredAt: now,
      expiresAt: input.expiresAt,
      status: RiskExceptionStatus.Active,
      createdAt: now,
      updatedAt: now,
    };

    await this.exceptionRepo.create(
      exception,
      buildAuditEntry({
        now,
        actor: input.declaredBy,
        action: AUDIT_ACTIONS.Declared,
        note: trimmedJustification,
      })
    );

    return exception;
  }
}
