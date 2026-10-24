/**
 * Sample Process Stats Use Case (spec 144)
 *
 * CPU and memory of one process, for `shep status`. Goes through the same
 * IProcessStatsProbe as `shep ps`, so presentation never shells out to `ps`.
 */

import { inject, injectable } from 'tsyringe';
import type {
  IProcessStatsProbe,
  ProcessStats,
} from '../../ports/output/services/process-stats-probe.interface.js';

@injectable()
export class SampleProcessStatsUseCase {
  constructor(
    @inject('IProcessStatsProbe')
    private readonly probe: IProcessStatsProbe
  ) {}

  /** The process's stats, or undefined when the OS gave none (Windows, gone, timed out). */
  async execute(pid: number): Promise<ProcessStats | undefined> {
    return (await this.probe.sample([pid])).get(pid);
  }
}
