/**
 * ConvertFindingToWorkItemUseCase unit tests (feature 098, phase 7, task-45).
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import {
  ConvertFindingToWorkItemUseCase,
  severityToPriority,
} from '@/application/use-cases/aspm/findings/convert-finding-to-work-item.js';
import { FindingNotFoundError } from '@/domain/aspm/errors/finding-not-found.error.js';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  Priority,
  type PmProject,
  type SecurityFinding,
  type WorkItem,
  type WorkItemState,
} from '@/domain/generated/output.js';
import type {
  FindingUpdateInput,
  IFindingRepository,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';

const NOW = new Date('2026-05-19T00:00:00.000Z');

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: 'f-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'semgrep.sql-injection',
    title: 'SQL injection in handler',
    description: 'Tainted input.',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: NOW,
    lastSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as SecurityFinding;
}

function makeProject(): PmProject {
  return { id: 'proj-1', identifierPrefix: 'SEC' } as unknown as PmProject;
}

function makeState(id: string, isDefault: boolean): WorkItemState {
  return { id, isDefault } as unknown as WorkItemState;
}

interface Fakes {
  finding: IFindingRepository;
  workItems: IWorkItemRepository;
  projects: IPmProjectRepository;
  states: IWorkItemStateRepository;
  workItemStore: Map<string, WorkItem>;
  findingStore: Map<string, SecurityFinding>;
  counter: { value: number };
}

function makeFakes(initial: { finding?: SecurityFinding; workItem?: WorkItem } = {}): Fakes {
  const findingStore = new Map<string, SecurityFinding>();
  if (initial.finding) findingStore.set(initial.finding.id, initial.finding);
  const workItemStore = new Map<string, WorkItem>();
  if (initial.workItem) workItemStore.set(initial.workItem.id, initial.workItem);
  const counter = { value: 0 };

  const finding: IFindingRepository = {
    findById: async (id: string) => findingStore.get(id) ?? null,
    update: async (id: string, fields: FindingUpdateInput) => {
      const f = findingStore.get(id);
      if (f) findingStore.set(id, { ...f, ...fields } as SecurityFinding);
    },
  } as unknown as IFindingRepository;

  const workItems: IWorkItemRepository = {
    create: async (wi: WorkItem) => {
      workItemStore.set(wi.id, wi);
    },
    findById: async (id: string) => workItemStore.get(id) ?? null,
  } as unknown as IWorkItemRepository;

  const projects: IPmProjectRepository = {
    findById: async () => makeProject(),
    incrementWorkItemCounter: async () => ++counter.value,
  } as unknown as IPmProjectRepository;

  const states: IWorkItemStateRepository = {
    listByProject: async () => [makeState('state-todo', true), makeState('state-doing', false)],
  } as unknown as IWorkItemStateRepository;

  return { finding, workItems, projects, states, workItemStore, findingStore, counter };
}

describe('ConvertFindingToWorkItemUseCase', () => {
  it('creates a WorkItem and back-references the finding', async () => {
    const fakes = makeFakes({ finding: makeFinding() });
    const uc = new ConvertFindingToWorkItemUseCase(
      fakes.finding,
      fakes.workItems,
      fakes.projects,
      fakes.states
    );
    const result = await uc.execute({ findingId: 'f-1', projectId: 'proj-1' });

    expect(result.alreadyLinked).toBe(false);
    expect(result.workItem.title).toContain('SQL injection');
    expect(result.workItem.priority).toBe(Priority.High);
    expect(result.workItem.stateId).toBe('state-todo');
    expect(result.finding.workItemId).toBe(result.workItem.id);
    expect(fakes.findingStore.get('f-1')?.workItemId).toBe(result.workItem.id);
  });

  it('is idempotent — returns existing workItem when finding already linked', async () => {
    const wi = { id: 'wi-existing', title: 'old' } as unknown as WorkItem;
    const fakes = makeFakes({
      finding: makeFinding({ workItemId: 'wi-existing' }),
      workItem: wi,
    });
    const uc = new ConvertFindingToWorkItemUseCase(
      fakes.finding,
      fakes.workItems,
      fakes.projects,
      fakes.states
    );
    const result = await uc.execute({ findingId: 'f-1', projectId: 'proj-1' });

    expect(result.alreadyLinked).toBe(true);
    expect(result.workItem.id).toBe('wi-existing');
    expect(fakes.counter.value).toBe(0); // no new sequence consumed
  });

  it('throws FindingNotFoundError when the finding is unknown', async () => {
    const fakes = makeFakes();
    const uc = new ConvertFindingToWorkItemUseCase(
      fakes.finding,
      fakes.workItems,
      fakes.projects,
      fakes.states
    );
    await expect(uc.execute({ findingId: 'missing', projectId: 'proj-1' })).rejects.toBeInstanceOf(
      FindingNotFoundError
    );
  });

  it('re-mints when finding carries a stale workItemId pointer', async () => {
    const fakes = makeFakes({ finding: makeFinding({ workItemId: 'wi-gone' }) });
    const uc = new ConvertFindingToWorkItemUseCase(
      fakes.finding,
      fakes.workItems,
      fakes.projects,
      fakes.states
    );
    const result = await uc.execute({ findingId: 'f-1', projectId: 'proj-1' });
    expect(result.alreadyLinked).toBe(false);
    expect(result.workItem.id).not.toBe('wi-gone');
  });

  it('honors an explicit stateId override', async () => {
    const fakes = makeFakes({ finding: makeFinding() });
    const uc = new ConvertFindingToWorkItemUseCase(
      fakes.finding,
      fakes.workItems,
      fakes.projects,
      fakes.states
    );
    const result = await uc.execute({
      findingId: 'f-1',
      projectId: 'proj-1',
      stateId: 'state-doing',
    });
    expect(result.workItem.stateId).toBe('state-doing');
  });

  it.each([
    [CanonicalSeverity.Critical, Priority.Urgent],
    [CanonicalSeverity.High, Priority.High],
    [CanonicalSeverity.Medium, Priority.Medium],
    [CanonicalSeverity.Low, Priority.Low],
    [CanonicalSeverity.Info, Priority.None],
  ])('maps %s severity → %s priority', (severity, priority) => {
    expect(severityToPriority(severity)).toBe(priority);
  });
});
