/**
 * Report Host Activity Use Case (spec 149)
 *
 * Tells the terminal host this process runs in (Herdr) what shep is doing:
 * only when the state or its message changes, never more than that, and lets
 * go of the pane when the caller is done. Inert outside a host. Never throws:
 * a host must not be able to slow or break the console.
 *
 * Holds the last report, so callers resolve one instance per process.
 */

import { inject, injectable } from 'tsyringe';
import type {
  HostActivityReport,
  IActivityHostReporter,
} from '../../ports/output/services/activity-host-reporter.interface.js';

@injectable()
export class ReportHostActivityUseCase {
  private last: HostActivityReport | undefined;
  private released = false;

  constructor(
    @inject('IActivityHostReporter')
    private readonly reporter: IActivityHostReporter
  ) {}

  execute(report: HostActivityReport): void {
    if (!this.reporter.available || this.released || sameReport(this.last, report)) return;
    this.last = report;
    try {
      this.reporter.report(report);
    } catch {
      // A host that cannot be told is a host that shows less; shep goes on.
    }
  }

  async release(): Promise<void> {
    if (!this.reporter.available || !this.last || this.released) return;
    this.released = true;
    await this.reporter.release().catch(() => undefined);
  }
}

function sameReport(a: HostActivityReport | undefined, b: HostActivityReport): boolean {
  return a?.state === b.state && a.message === b.message;
}
