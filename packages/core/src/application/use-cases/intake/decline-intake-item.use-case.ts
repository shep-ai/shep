import { injectable, inject } from 'tsyringe';
import { IntakeStatus } from '../../../domain/generated/output.js';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';

export interface DeclineIntakeItemInput {
  intakeItemId: string;
  reason: string;
}

export type DeclineIntakeItemResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeclineIntakeItemUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository
  ) {}

  async execute(input: DeclineIntakeItemInput): Promise<DeclineIntakeItemResult> {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      return { ok: false, error: 'Decline reason is required.' };
    }

    const item = await this.intakeRepo.findById(input.intakeItemId);
    if (!item) {
      return { ok: false, error: `Intake item not found: "${input.intakeItemId}"` };
    }

    if (item.status !== IntakeStatus.Pending) {
      return {
        ok: false,
        error: `Intake item must be in Pending status to decline (current: ${item.status}).`,
      };
    }

    await this.intakeRepo.update(input.intakeItemId, {
      status: IntakeStatus.Declined,
      declineReason: trimmedReason,
    });

    return { ok: true };
  }
}
