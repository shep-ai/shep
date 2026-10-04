import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { GetTrackerIssueLinkUseCase } from '@/application/use-cases/trackers/get-tracker-issue-link.use-case.js';
import { Priority, StateGroup } from '@/domain/generated/output.js';
import { InMemoryTrackerLinks } from '../../../../helpers/tracker-repositories.mock.js';

describe('GetTrackerIssueLinkUseCase', () => {
  it("returns a work item's link, or null when it is not synced", async () => {
    const links = new InMemoryTrackerLinks();
    const T = new Date();
    const link = {
      workItemId: 'wi',
      ruleId: 'r',
      connectionId: 'c',
      externalId: 'x',
      externalKey: 'ENG-1',
      externalUrl: 'https://linear.app/x',
      syncedTitle: 't',
      syncedStateGroup: StateGroup.Started,
      syncedPriority: Priority.None,
      remoteUpdatedAt: T,
      createdAt: T,
      updatedAt: T,
    };
    await links.upsert(link);
    const useCase = new GetTrackerIssueLinkUseCase(links);
    expect(await useCase.execute('wi')).toEqual(link);
    expect(await useCase.execute('other')).toBeNull();
  });
});
