/**
 * GetParallelCapacityUseCase
 *
 * The presentation-facing read model for the parallel-feature cap: how many
 * features may run, how many are running, and who is waiting.
 *
 * One call returns the whole queue with positions, so no surface has to ask
 * per-feature (the canvas renders every node from a single snapshot) and none
 * of them re-derives "am I queued, and how far back" from the entity.
 *
 * Presentation-agnostic by construction: no HTTP, terminal or React concepts
 * appear in the result, so the web canvas, `shep feat list` and the TUI all
 * render the same numbers from the same source.
 */

import { injectable, inject } from 'tsyringe';
import {
  FeatureCapacityService,
  type ParallelCapacitySnapshot,
} from './feature-capacity.service.js';

@injectable()
export class GetParallelCapacityUseCase {
  constructor(
    @inject(FeatureCapacityService)
    private readonly capacity: FeatureCapacityService
  ) {}

  async execute(): Promise<ParallelCapacitySnapshot> {
    return this.capacity.snapshot();
  }
}
