/**
 * ListExpiringExceptionsUseCase (feature 098, phase 6, task-36).
 *
 * Returns Active RiskExceptions whose `expiresAt` falls within the next
 * N days from the current clock. Powers the dashboard "expiring soon"
 * tile (FR-24) and the `shep aspm exceptions list-expiring` CLI command.
 */

import { inject, injectable } from 'tsyringe';
import { RiskExceptionStatus, type RiskException } from '../../../../domain/generated/output.js';
import type { IRiskExceptionRepository } from '../../../ports/output/repositories/risk-exception-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

/** Default look-ahead window used by the dashboard tile. */
export const DEFAULT_EXPIRING_WINDOW_DAYS = 14;

export interface ListExpiringExceptionsInput {
  /** Look-ahead window in days. Defaults to 14. */
  withinDays?: number;
}

@injectable()
export class ListExpiringExceptionsUseCase {
  constructor(
    @inject('IRiskExceptionRepository')
    private readonly exceptionRepo: IRiskExceptionRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: ListExpiringExceptionsInput = {}): Promise<RiskException[]> {
    const withinDays = input.withinDays ?? DEFAULT_EXPIRING_WINDOW_DAYS;
    if (withinDays < 0) {
      throw new Error('withinDays must be non-negative');
    }

    return this.exceptionRepo.listByStatus([RiskExceptionStatus.Active], {
      expiringWithinDays: withinDays,
      now: this.clock.now(),
    });
  }
}
