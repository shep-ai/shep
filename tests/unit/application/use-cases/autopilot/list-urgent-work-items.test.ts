import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { Priority, SpaceResolutionSource, StateGroup } from '@/domain/generated/output.js';
import { ListUrgentWorkItemsUseCase } from '@/application/use-cases/autopilot/list-urgent-work-items.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';

const STATES = [
  { id: 'st-todo', stateGroup: StateGroup.Unstarted, displayOrder: 1, isDefault: true },
  { id: 'st-done', stateGroup: StateGroup.Completed, displayOrder: 2, isDefault: false },
];

function world() {
  const projects = {
    list: vi.fn(async () => [
      { id: 'p-pay', applicationId: 'app-pay' },
      { id: 'p-home', applicationId: 'app-home' },
      { id: 'p-loose' },
    ]),
  } as unknown as IPmProjectRepository;
  const applications = {
    findById: vi.fn(async (id: string) =>
      id === 'app-pay'
        ? { id, repositoryPath: '/work/pay' }
        : id === 'app-home'
          ? { id, repositoryPath: '/me/home' }
          : null
    ),
  } as unknown as IApplicationRepository;
  const listByProject = vi.fn(async (projectId: string) =>
    projectId === 'p-pay'
      ? [
          { id: 'wi-1', projectId, priority: Priority.Urgent, stateId: 'st-todo' },
          { id: 'wi-2', projectId, priority: Priority.Urgent, stateId: 'st-done' },
        ]
      : [{ id: 'wi-9', projectId, priority: Priority.Urgent, stateId: 'st-todo' }]
  );
  const workItems = { listByProject } as unknown as IWorkItemRepository;
  const states = {
    listByProject: vi.fn(async () => STATES),
  } as unknown as IWorkItemStateRepository;
  const spaces = {
    executeMany: vi.fn(async (paths: string[]) =>
      paths.map((repositoryPath) => ({
        repositoryPath,
        space: { id: repositoryPath.startsWith('/work') ? 'space-acme' : 'space-me' },
        source: SpaceResolutionSource.Rule,
      }))
    ),
  } as unknown as ResolveSpaceContextUseCase;
  return {
    listByProject,
    useCase: new ListUrgentWorkItemsUseCase(projects, applications, workItems, states, spaces),
  };
}

describe('ListUrgentWorkItemsUseCase (spec 132)', () => {
  it("lists the open Urgent work items of the space's projects with their repository", async () => {
    const { useCase, listByProject } = world();
    const items = await useCase.execute('space-acme');
    expect(items.map((i) => [i.workItem.id, i.repositoryPath])).toEqual([['wi-1', '/work/pay']]);
    expect(listByProject).toHaveBeenCalledWith('p-pay', { priorities: [Priority.Urgent] });
    expect(listByProject).not.toHaveBeenCalledWith('p-home', expect.anything());
  });
});
