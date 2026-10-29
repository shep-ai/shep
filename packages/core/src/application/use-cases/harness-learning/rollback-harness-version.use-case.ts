/**
 * RollbackHarnessVersionUseCase (spec 150) — undo the repository's current
 * learned harness: it becomes RolledBack and its parent is adopted again (or,
 * with no parent, the repository runs without a learned overlay).
 */

import { inject, injectable } from 'tsyringe';
import { LearnedHarnessStatus } from '../../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';

const DEFAULT_ROLLBACK_REASON = 'rolled back';

export interface RollbackHarnessVersionResult {
  rolledBack: boolean;
  reason?: string;
  /** The version adopted again, when the rolled-back one had a parent. */
  restoredVersionId?: string;
}

@injectable()
export class RollbackHarnessVersionUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository
  ) {}

  async execute(input: {
    repositoryPath: string;
    reason?: string;
  }): Promise<RollbackHarnessVersionResult> {
    const repositoryPath = normalizeRepositoryPath(input.repositoryPath);
    const current = await this.harnesses.findAdopted({ repositoryPath });
    if (!current || current.repositoryPath !== repositoryPath) {
      return {
        rolledBack: false,
        reason: 'nothing is adopted for this repository — it already runs on the base harness',
      };
    }
    const reason = input.reason?.trim();
    await this.harnesses.updateStatus(
      current.id,
      LearnedHarnessStatus.RolledBack,
      reason && reason.length > 0 ? reason : DEFAULT_ROLLBACK_REASON
    );
    const parent = current.parentVersionId
      ? await this.harnesses.findVersion(current.parentVersionId)
      : null;
    if (parent && parent.status !== LearnedHarnessStatus.Rejected) {
      await this.harnesses.adopt(parent.id);
      return { rolledBack: true, restoredVersionId: parent.id };
    }
    return { rolledBack: true };
  }
}
