/** Shared fakes for the bug loop use-case tests (spec 123). */

import { vi } from 'vitest';
import {
  AgentType,
  Priority,
  type WorkItem,
  type WorkItemInvestigation,
  InvestigationStatus,
} from '@/domain/generated/output.js';
import type { GetWorkItemUseCase } from '@/application/use-cases/work-items/get-work-item.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import type { ResolveSpaceEnvironmentUseCase } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import type { SpaceEnvironment } from '@/domain/shared/space-environment.js';

export const T0 = new Date('2026-10-04T10:00:00Z');

export const WORK_ITEM: WorkItem = {
  id: 'item-1',
  projectId: 'project-1',
  sequenceId: 42,
  identifierPrefix: 'PAY',
  title: 'Refunds fail for guest users',
  description: 'Steps: refund an order placed without an account.',
  stateId: 'st-todo',
  priority: Priority.High,
  sortOrder: 0,
  createdAt: T0,
  updatedAt: T0,
} as WorkItem;

export const SPACE_ENVIRONMENT: SpaceEnvironment = {
  set: { GIT_AUTHOR_NAME: 'Work Me' },
  unset: ['GH_TOKEN'],
};

export function fakeGetWorkItem(items: WorkItem[] = [WORK_ITEM]): GetWorkItemUseCase {
  return {
    execute: vi.fn(async (ref: string) => {
      const item = items.find((i) => i.id === ref || `PAY-${i.sequenceId}` === ref);
      return item
        ? { ok: true, workItem: item }
        : { ok: false, error: `Work item not found: "${ref}"` };
    }),
  } as unknown as GetWorkItemUseCase;
}

export function fakeProjects(applicationId?: string): IPmProjectRepository {
  return {
    findById: vi.fn(async (id: string) => ({ id, applicationId })),
  } as unknown as IPmProjectRepository;
}

export function fakeApplications(repositoryPath?: string): IApplicationRepository {
  return {
    findById: vi.fn(async (id: string) => (repositoryPath ? { id, repositoryPath } : null)),
  } as unknown as IApplicationRepository;
}

export function fakeSettings(type: AgentType = AgentType.ClaudeCode): ISettingsProvider {
  return { has: () => true, get: () => ({ agent: { type } }) } as unknown as ISettingsProvider;
}

export function fakeSpaceEnvironment(refusal?: string): ResolveSpaceEnvironmentUseCase {
  return {
    execute: vi.fn(async () => ({
      context: { space: { id: 'space-work', name: 'Work' } },
      environment: SPACE_ENVIRONMENT,
      ...(refusal ? { agentRefusal: refusal } : {}),
    })),
  } as unknown as ResolveSpaceEnvironmentUseCase;
}

export function investigation(over: Partial<WorkItemInvestigation> = {}): WorkItemInvestigation {
  return {
    id: 'inv-1',
    workItemId: WORK_ITEM.id,
    repositoryPath: '/src/pay',
    status: InvestigationStatus.Pending,
    hypotheses: [],
    agentType: AgentType.ClaudeCode,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}
