/**
 * NoOp AI Change Risk Signal Repository
 *
 * Phase 7 placeholder used by `GetPostureSummaryUseCase` so the dashboard
 * tile renders deterministically when the SQLite repository is not
 * registered (e.g. lightweight test harnesses). Phase 8 overrides the
 * `IAiChangeRiskSignalRepository` binding with
 * {@link SQLiteAiChangeRiskSignalRepository}; the NoOp survives only for
 * codepaths that exercise the dashboard without the queue persistence.
 */

import { injectable } from 'tsyringe';
import type { AiChangeRiskSignal, AiSignalState } from '../../../domain/generated/output.js';
import type {
  AiSignalListFilter,
  IAiChangeRiskSignalRepository,
} from '../../../application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';

@injectable()
export class NoOpAiChangeRiskSignalRepository implements IAiChangeRiskSignalRepository {
  async countOpen(): Promise<number> {
    return 0;
  }

  async create(_signal: AiChangeRiskSignal): Promise<void> {
    // Intentionally a no-op — see class docstring.
  }

  async findById(_id: string): Promise<AiChangeRiskSignal | null> {
    return null;
  }

  async list(_filter?: AiSignalListFilter): Promise<AiChangeRiskSignal[]> {
    return [];
  }

  async markGraduated(_id: string, _graduatedFindingId: string, _now: Date): Promise<void> {
    // Intentionally a no-op — see class docstring.
  }

  async markDismissed(_id: string, _evidence: string | undefined, _now: Date): Promise<void> {
    // Intentionally a no-op — see class docstring.
  }

  async updateState(_id: string, _state: AiSignalState, _now: Date): Promise<void> {
    // Intentionally a no-op — see class docstring.
  }

  async softDelete(_id: string): Promise<void> {
    // Intentionally a no-op — see class docstring.
  }
}
