/**
 * NoOp AI Change Risk Signal Repository
 *
 * Phase 7 placeholder used by `GetPostureSummaryUseCase` so the dashboard
 * tile renders deterministically before phase 8 ships the real SQLite repo
 * backed by the ai_change_risk_signals table. Always reports zero open
 * signals — once phase 8 lands, `register-aspm.ts` will overwrite the
 * binding with the real implementation and the tile picks up live counts
 * without any caller change.
 */

import { injectable } from 'tsyringe';
import type { IAiChangeRiskSignalRepository } from '../../../application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';

@injectable()
export class NoOpAiChangeRiskSignalRepository implements IAiChangeRiskSignalRepository {
  async countOpen(): Promise<number> {
    return 0;
  }
}
