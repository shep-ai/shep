/**
 * ResolveHarnessDecisionUseCase (spec 150) — applies an inbox answer to a
 * HarnessChange decision: Adopt adopts the version, Reject (or a typed note)
 * rejects it with that note as feedback.
 */

import { inject, injectable } from 'tsyringe';
import type { DecisionResponse } from '../../../domain/generated/output.js';
import { harnessVerdictFromResponses } from '../../../domain/harness-learning/harness-decision.js';
import { AdoptHarnessVersionUseCase } from './adopt-harness-version.use-case.js';
import { RejectHarnessVersionUseCase } from './reject-harness-version.use-case.js';

@injectable()
export class ResolveHarnessDecisionUseCase {
  constructor(
    @inject(AdoptHarnessVersionUseCase) private readonly adopt: AdoptHarnessVersionUseCase,
    @inject(RejectHarnessVersionUseCase) private readonly reject: RejectHarnessVersionUseCase
  ) {}

  /** @returns true when the responses answered a harness change and were applied. */
  async execute(responses: readonly DecisionResponse[], actor: string): Promise<boolean> {
    const verdict = harnessVerdictFromResponses(responses);
    if (!verdict) return false;
    if (verdict.verdict === 'adopt') {
      return (await this.adopt.execute({ versionId: verdict.versionId, actor })).adopted;
    }
    return (
      await this.reject.execute({
        versionId: verdict.versionId,
        ...(verdict.feedback ? { feedback: verdict.feedback } : {}),
        actor,
      })
    ).rejected;
  }
}
