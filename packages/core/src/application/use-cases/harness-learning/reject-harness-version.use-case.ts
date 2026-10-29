/**
 * RejectHarnessVersionUseCase (spec 150) — a person declines a candidate. The
 * feedback is kept on the version, and the next reflection reads it in the
 * library index so the same proposal is not made again.
 */

import { inject, injectable } from 'tsyringe';
import { LearnedHarnessStatus, TelemetryEvent } from '../../../domain/generated/output.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';
import { HarnessDecisionSettler } from './harness-decision-settler.js';
import { resolveHarnessVersion } from './resolve-harness-version.js';

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
    @inject(HarnessDecisionSettler) private readonly settler: HarnessDecisionSettler,
    @inject('ITelemetry') private readonly telemetry: ITelemetry
  ) {}

  async execute(input: RejectHarnessVersionInput): Promise<{ rejected: boolean; reason?: string }> {
    const version = await resolveHarnessVersion(this.harnesses, input.versionId);
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
    this.telemetry.record(TelemetryEvent.HarnessVersionRejected, {
      origin: version.origin,
      withFeedback: Boolean(feedback),
    });
    return { rejected: true };
  }
}
