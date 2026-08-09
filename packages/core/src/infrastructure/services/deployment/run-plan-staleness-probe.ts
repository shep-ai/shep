/**
 * Run Plan Staleness Probe (infrastructure adapter)
 *
 * Thin adapter over the two on-disk facts the run-plan use cases need:
 * `computeConfigHash` for drift, and the `.shep/dev.json` reader for "is a
 * committed override in charge here?". Both live in infrastructure because
 * both read the filesystem; this class is what lets the application layer use
 * them through a port instead of importing them.
 *
 * Neither method throws. A plan lookup must survive an unreadable repository:
 * a failed hash reads as "changed" (worst case, one re-analysis) and a failed
 * config read reads as "no committed override" (worst case, an override the
 * user can still save).
 */

import { injectable } from 'tsyringe';

import type { IRunPlanStalenessProbe } from '../../../application/ports/output/services/run-plan-staleness-probe.interface.js';
import { computeConfigHash } from './config-hash.js';
import { readRepoDevConfig } from './repo-dev-config-reader.js';

@injectable()
export class RunPlanStalenessProbe implements IRunPlanStalenessProbe {
  currentConfigHash(repoPath: string): string {
    try {
      return computeConfigHash(repoPath);
    } catch {
      return '';
    }
  }

  hasRepoDevConfig(repoPath: string): boolean {
    try {
      return readRepoDevConfig(repoPath) !== null;
    } catch {
      return false;
    }
  }
}
