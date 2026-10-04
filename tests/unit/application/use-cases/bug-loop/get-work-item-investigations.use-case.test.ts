import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GetWorkItemInvestigationsUseCase } from '@/application/use-cases/bug-loop/get-work-item-investigations.use-case.js';
import { ABANDONED_INVESTIGATION_ERROR } from '@/application/use-cases/bug-loop/investigation-records.js';
import { InvestigationStatus } from '@/domain/generated/output.js';
import { INVESTIGATION_STALE_AFTER_MS } from '@/domain/shared/investigation.js';
import { InMemoryInvestigations } from '../../../../helpers/investigation-repository.mock.js';
import { T0, WORK_ITEM, fakeGetWorkItem, investigation } from './bug-loop.fixtures.js';

describe('GetWorkItemInvestigationsUseCase', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the work item and its investigations newest first', async () => {
    const repo = new InMemoryInvestigations();
    await repo.create(investigation({ id: 'old', status: InvestigationStatus.Failed }));
    await repo.create(
      investigation({
        id: 'new',
        createdAt: new Date(T0.getTime() + 1),
        status: InvestigationStatus.Completed,
      })
    );
    const result = await new GetWorkItemInvestigationsUseCase(repo, fakeGetWorkItem()).execute(
      'PAY-42'
    );
    expect(result.ok && result.workItem.id).toBe(WORK_ITEM.id);
    expect(result.ok && result.investigations.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('reports an abandoned investigation as failed', async () => {
    vi.useFakeTimers({ now: new Date(T0.getTime() + INVESTIGATION_STALE_AFTER_MS + 1) });
    const repo = new InMemoryInvestigations();
    await repo.create(investigation({ status: InvestigationStatus.Running }));
    const result = await new GetWorkItemInvestigationsUseCase(repo, fakeGetWorkItem()).execute(
      'PAY-42'
    );
    expect(result.ok && result.investigations[0]).toMatchObject({
      status: InvestigationStatus.Failed,
      error: ABANDONED_INVESTIGATION_ERROR,
    });
    expect((await repo.findById('inv-1'))?.status).toBe(InvestigationStatus.Failed);
  });

  it('refuses an unknown work item', async () => {
    const result = await new GetWorkItemInvestigationsUseCase(
      new InMemoryInvestigations(),
      fakeGetWorkItem()
    ).execute('PAY-1');
    expect(result).toEqual({ ok: false, error: 'Work item not found: "PAY-1"' });
  });
});
