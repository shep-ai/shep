/**
 * Phase Timing Context Adapter
 *
 * Injectable adapter that implements IPhaseTimingContext by delegating
 * to the module-level phase-timing-context helpers. Allows application-
 * layer use cases to record lifecycle events without importing
 * infrastructure directly.
 */

import { injectable } from 'tsyringe';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { recordLifecycleEvent } from './phase-timing-context.js';

@injectable()
export class PhaseTimingContextAdapter implements IPhaseTimingContext {
  async recordLifecycleEvent(
    phase: string,
    runId: string,
    repository: IPhaseTimingRepository
  ): Promise<void> {
    await recordLifecycleEvent(phase, runId, repository);
  }
}
