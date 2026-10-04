/**
 * Reading a work item's investigations (spec 123): one left Pending or
 * Running by a process that died is recorded as Failed on the way out, so
 * every surface sees the same truth and a new investigation can start.
 */

import {
  InvestigationStatus,
  type WorkItemInvestigation,
} from '../../../domain/generated/output.js';
import { isInvestigationStale } from '../../../domain/shared/investigation.js';
import type { IInvestigationRepository } from '../../ports/output/repositories/investigation-repository.interface.js';

export const ABANDONED_INVESTIGATION_ERROR =
  'The investigation stopped without finishing (shep was restarted or the agent hung).';

/** A work item's investigations, newest first, with abandoned ones failed. */
export async function listInvestigations(
  repo: IInvestigationRepository,
  workItemId: string
): Promise<WorkItemInvestigation[]> {
  const now = new Date();
  const investigations = await repo.listByWorkItem(workItemId);
  return Promise.all(
    investigations.map(async (investigation) => {
      if (!isInvestigationStale(investigation, now)) return investigation;
      const failed: WorkItemInvestigation = {
        ...investigation,
        status: InvestigationStatus.Failed,
        error: ABANDONED_INVESTIGATION_ERROR,
        finishedAt: now,
        updatedAt: now,
      };
      await repo.update(failed);
      return failed;
    })
  );
}
