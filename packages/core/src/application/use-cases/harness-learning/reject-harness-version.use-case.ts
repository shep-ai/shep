/**
 * RejectHarnessVersionUseCase (spec 150) — a person declines a candidate. The
 * feedback is kept on the version, and the next reflection reads it in the
 * library index so the same proposal is not made again.
 */

import { inject, injectable } from 'tsyringe';
import { LearnedHarnessStatus } from '../../../domain/generated/output.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import { HarnessDecisionSettler } from './harness-decision-settler.js';

const MAX_FEEDBACK_CHARS = 2000;

export interface RejectHarnessVersionInput {
  versionId: string;
  feedback?: string;
  actor: string;
}

@injectable()
export class RejectHarnessVersionUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject(HarnessDecisionSettler) private readonly settler: HarnessDecisionSettler
  ) {}

  async execute(input: RejectHarnessVersionInput): Promise<{ rejected: boolean; reason?: string }> {
    const version = await this.harnesses.findVersion(input.versionId);
    if (!version) return { rejected: false, reason: 'version not found' };
    if (version.status !== LearnedHarnessStatus.Candidate) {
      return {
        rejected: false,
        reason: `only a candidate can be rejected (this one is ${version.status})`,
      };
    }
    const feedback = input.feedback?.trim().slice(0, MAX_FEEDBACK_CHARS);
    await this.harnesses.updateStatus(
      version.id,
      LearnedHarnessStatus.Rejected,
      feedback && feedback.length > 0 ? feedback : undefined
    );
    await this.settler.settle(
      version,
      feedback ? `Rejected: ${feedback}` : 'Rejected',
      input.actor
    );
    return { rejected: true };
  }
}
