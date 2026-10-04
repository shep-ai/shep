/**
 * GetTrackerIssueLinkUseCase (spec 122): the tracker issue a work item is
 * synced with, for showing its key and link next to the work item.
 */

import { injectable, inject } from 'tsyringe';
import type { TrackerIssueLink } from '../../../domain/generated/output.js';
import type { ITrackerIssueLinkRepository } from '../../ports/output/repositories/tracker-issue-link-repository.interface.js';

@injectable()
export class GetTrackerIssueLinkUseCase {
  constructor(
    @inject('ITrackerIssueLinkRepository') private readonly links: ITrackerIssueLinkRepository
  ) {}

  async execute(workItemId: string): Promise<TrackerIssueLink | null> {
    return this.links.findByWorkItemId(workItemId);
  }
}
