/**
 * RecordAiChangeRiskSignalUseCase (feature 098, phase 8, task-50).
 *
 * Records a new AiChangeRiskSignal in the `/aspm/ai-review` queue. The
 * use case is **agent-agnostic** by design (NFR-4, .claude/rules/code-quality.md
 * "Agent-Agnostic Design") — it accepts a string `agentSessionId` and does
 * not import any AI-provider SDK. Shep's existing agent infrastructure
 * resolves this use case from the DI container and calls it from
 * post-change hooks (FR-30).
 *
 * Validation:
 *   - The target Application must exist (referential integrity).
 *   - `summary` cannot be empty.
 *   - Evidence is opaque; the caller is responsible for redacting
 *     scanner-style raw secrets before persistence.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  AiSignalState,
  type AiChangeRiskSignal,
  type AiSignalType,
  type CanonicalSeverity,
} from '../../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../../domain/aspm/errors/application-not-found.error.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IAiChangeRiskSignalRepository } from '../../../ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface RecordAiChangeRiskSignalInput {
  applicationId: string;
  signalType: AiSignalType;
  severity: CanonicalSeverity;
  summary: string;
  evidence?: string;
  agentSessionId?: string;
  ownerId?: string;
}

@injectable()
export class RecordAiChangeRiskSignalUseCase {
  constructor(
    @inject('IAiChangeRiskSignalRepository')
    private readonly signalRepo: IAiChangeRiskSignalRepository,
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: RecordAiChangeRiskSignalInput): Promise<AiChangeRiskSignal> {
    const trimmedSummary = input.summary.trim();
    if (trimmedSummary.length === 0) {
      throw new Error('AiChangeRiskSignal summary cannot be empty');
    }

    const application = await this.applicationRepo.findById(input.applicationId);
    if (application === null) {
      throw new ApplicationNotFoundError(input.applicationId);
    }

    const now = this.clock.now();
    const signal: AiChangeRiskSignal = {
      id: randomUUID(),
      applicationId: input.applicationId,
      agentSessionId: input.agentSessionId,
      signalType: input.signalType,
      severity: input.severity,
      summary: trimmedSummary,
      evidence: input.evidence,
      state: AiSignalState.Open,
      ownerId: input.ownerId,
      discoveredAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.signalRepo.create(signal);
    return signal;
  }
}
