/**
 * No-op activity reporter (spec 149): the adapter outside any terminal host
 * that shows agent state. Reports go nowhere.
 */

import type {
  HostActivityReport,
  IActivityHostReporter,
} from '../../../application/ports/output/services/activity-host-reporter.interface.js';

export class NoopActivityReporter implements IActivityHostReporter {
  readonly available = false;

  report(_report: HostActivityReport): void {
    // Not inside a host: nothing to tell.
  }

  async release(): Promise<void> {
    // Nothing was reported, so nothing to release.
  }
}
