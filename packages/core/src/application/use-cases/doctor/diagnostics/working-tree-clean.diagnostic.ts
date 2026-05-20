/**
 * WorkingTreeCleanDiagnostic
 *
 * Reports whether the local working tree has uncommitted changes. Surfaced
 * for first-time contributors who clone, hack, then run `shep doctor` and
 * wonder why their environment "looks dirty" — a warn (not fail) keeps the
 * diagnostic informational rather than blocking.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IGitPrService } from '../../../ports/output/services/git-pr-service.interface.js';

@injectable()
export class WorkingTreeCleanDiagnostic implements IDiagnostic {
  readonly name = 'working-tree-clean';

  constructor(
    @inject('IGitPrService')
    private readonly gitService: IGitPrService,
    private readonly workspaceRoot: string = process.cwd()
  ) {}

  async run(): Promise<DiagnosticResult> {
    try {
      const dirty = await this.gitService.hasUncommittedChanges(this.workspaceRoot);
      if (dirty) {
        return {
          name: this.name,
          status: DiagnosticStatus.Warn,
          detail: 'Working tree has uncommitted changes',
          fixHint: 'Run `git status` to review; commit or stash before opening a PR',
        };
      }
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: 'Working tree is clean',
      };
    } catch (err) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: `Could not determine working-tree status: ${err instanceof Error ? err.message : String(err)}`,
        fixHint: 'Run `git status` from the repo root',
      };
    }
  }
}
