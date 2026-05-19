/**
 * GraduateAiSignalToFindingUseCase (feature 098, phase 8, task-50).
 *
 * Converts a confirmed AiChangeRiskSignal into a SecurityFinding,
 * preserving the evidence payload and creating the link back to the
 * originating signal (FR-31).
 *
 * Idempotency: if the signal has already been graduated, the use case
 * throws {@link AiSignalAlreadyGraduatedError}. Callers detect the
 * already-graduated state via the signal's `state` field rather than
 * catching-and-retrying.
 *
 * Ownership: the resulting finding inherits the signal's ownerId when
 * present; otherwise the finding stays unowned for the standard
 * resolve-ownership flow to fill in later (FR-4).
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  AiSignalState,
  FindingDomain,
  FindingState,
  type AiChangeRiskSignal,
  type SecurityFinding,
} from '../../../../domain/generated/output.js';
import { AiSignalNotFoundError } from '../../../../domain/aspm/errors/ai-signal-not-found.error.js';
import { AiSignalAlreadyGraduatedError } from '../../../../domain/aspm/errors/ai-signal-already-graduated.error.js';
import type { IAiChangeRiskSignalRepository } from '../../../ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface GraduateAiSignalToFindingInput {
  signalId: string;
  /** Optional override title; defaults to the signal's summary. */
  title?: string;
  /** Optional override description; defaults to the signal's summary. */
  description?: string;
  /** Optional override ownerId; defaults to the signal's ownerId. */
  ownerId?: string;
}

export interface GraduateAiSignalToFindingOutput {
  signal: AiChangeRiskSignal;
  finding: SecurityFinding;
}

const AI_FINDING_SOURCE = 'ai-change-review';

function ruleIdFor(signal: AiChangeRiskSignal): string {
  return `ai-change.${signal.signalType.toLowerCase()}`;
}

@injectable()
export class GraduateAiSignalToFindingUseCase {
  constructor(
    @inject('IAiChangeRiskSignalRepository')
    private readonly signalRepo: IAiChangeRiskSignalRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: GraduateAiSignalToFindingInput): Promise<GraduateAiSignalToFindingOutput> {
    const signal = await this.signalRepo.findById(input.signalId);
    if (signal === null) throw new AiSignalNotFoundError(input.signalId);

    if (signal.state === AiSignalState.GraduatedToFinding) {
      throw new AiSignalAlreadyGraduatedError(signal.id, signal.graduatedFindingId);
    }
    if (signal.state === AiSignalState.Dismissed || signal.state === AiSignalState.Resolved) {
      throw new AiSignalAlreadyGraduatedError(signal.id, signal.graduatedFindingId);
    }

    const now = this.clock.now();
    const titleOverride = input.title?.trim();
    const descriptionOverride = input.description?.trim();
    const title =
      titleOverride !== undefined && titleOverride.length > 0 ? titleOverride : signal.summary;
    const description =
      descriptionOverride !== undefined && descriptionOverride.length > 0
        ? descriptionOverride
        : signal.summary;

    const finding: SecurityFinding = {
      id: randomUUID(),
      applicationId: signal.applicationId,
      findingDomain: FindingDomain.Ai,
      ruleId: ruleIdFor(signal),
      title,
      description,
      scannerRaw: signal.evidence,
      rawSeverity: signal.severity,
      canonicalSeverity: signal.severity,
      ownerId: input.ownerId ?? signal.ownerId,
      state: FindingState.Open,
      source: AI_FINDING_SOURCE,
      discoveredAt: signal.discoveredAt,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    } as SecurityFinding;

    await this.findingRepo.create(finding);
    await this.signalRepo.markGraduated(signal.id, finding.id, now);

    const updatedSignal: AiChangeRiskSignal = {
      ...signal,
      state: AiSignalState.GraduatedToFinding,
      graduatedFindingId: finding.id,
      resolvedAt: now,
      updatedAt: now,
    };

    return { signal: updatedSignal, finding };
  }
}
