/**
 * DismissAiSignalUseCase (feature 098, phase 8, task-50).
 *
 * Marks an AiChangeRiskSignal as a false-positive / not-actionable
 * (FR-32). The dismissal justification is folded into the signal's
 * evidence payload as a structured audit trail before the repository
 * transitions the state to {@link AiSignalState.Dismissed} — keeping the
 * evidence column self-describing without requiring a sibling audit-log
 * table.
 *
 * Idempotency: dismissing an already-terminal signal throws
 * {@link AiSignalAlreadyGraduatedError} so callers detect the state via
 * the signal's `state` field rather than catching and retrying.
 */

import { inject, injectable } from 'tsyringe';
import { AiSignalState, type AiChangeRiskSignal } from '../../../../domain/generated/output.js';
import { AiSignalNotFoundError } from '../../../../domain/aspm/errors/ai-signal-not-found.error.js';
import { AiSignalAlreadyGraduatedError } from '../../../../domain/aspm/errors/ai-signal-already-graduated.error.js';
import type { IAiChangeRiskSignalRepository } from '../../../ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface DismissAiSignalInput {
  signalId: string;
  actor: string;
  justification: string;
}

interface EvidenceEnvelope {
  original?: unknown;
  dismissals: { at: string; actor: string; justification: string }[];
}

function appendDismissal(
  existingEvidence: string | undefined,
  entry: { at: string; actor: string; justification: string }
): string {
  let parsed: EvidenceEnvelope = { dismissals: [] };
  if (existingEvidence !== undefined && existingEvidence !== null) {
    try {
      const raw = JSON.parse(existingEvidence) as unknown;
      if (raw && typeof raw === 'object' && Array.isArray((raw as EvidenceEnvelope).dismissals)) {
        parsed = raw as EvidenceEnvelope;
      } else {
        parsed = { original: raw, dismissals: [] };
      }
    } catch {
      parsed = { original: existingEvidence, dismissals: [] };
    }
  }
  parsed.dismissals.push(entry);
  return JSON.stringify(parsed);
}

@injectable()
export class DismissAiSignalUseCase {
  constructor(
    @inject('IAiChangeRiskSignalRepository')
    private readonly signalRepo: IAiChangeRiskSignalRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: DismissAiSignalInput): Promise<AiChangeRiskSignal> {
    const trimmed = input.justification.trim();
    if (trimmed.length === 0) {
      throw new Error('AiChangeRiskSignal dismissal justification cannot be empty');
    }

    const signal = await this.signalRepo.findById(input.signalId);
    if (signal === null) throw new AiSignalNotFoundError(input.signalId);

    if (
      signal.state === AiSignalState.GraduatedToFinding ||
      signal.state === AiSignalState.Dismissed ||
      signal.state === AiSignalState.Resolved
    ) {
      throw new AiSignalAlreadyGraduatedError(signal.id, signal.graduatedFindingId);
    }

    const now = this.clock.now();
    const updatedEvidence = appendDismissal(signal.evidence, {
      at: now.toISOString(),
      actor: input.actor,
      justification: trimmed,
    });

    await this.signalRepo.markDismissed(signal.id, updatedEvidence, now);

    return {
      ...signal,
      evidence: updatedEvidence,
      state: AiSignalState.Dismissed,
      resolvedAt: now,
      updatedAt: now,
    };
  }
}
