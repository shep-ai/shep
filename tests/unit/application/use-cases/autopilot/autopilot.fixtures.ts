/** Wires the autopilot use cases over fakes (spec 132). */

import { vi } from 'vitest';
import {
  HypothesisConfidence,
  InvestigationStatus,
  OpportunityStatus,
  Priority,
  type WorkItemInvestigation,
} from '@/domain/generated/output.js';
import { ManageAutopilotUseCase } from '@/application/use-cases/autopilot/manage-autopilot.use-case.js';
import { RunAutopilotUseCase } from '@/application/use-cases/autopilot/run-autopilot.use-case.js';
import type { ListUrgentWorkItemsUseCase } from '@/application/use-cases/autopilot/list-urgent-work-items.use-case.js';
import type { InvestigateWorkItemUseCase } from '@/application/use-cases/bug-loop/investigate-work-item.use-case.js';
import type { ApproveHypothesisUseCase } from '@/application/use-cases/bug-loop/approve-hypothesis.use-case.js';
import type { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import type { BuildOpportunityUseCase } from '@/application/use-cases/opportunities/build-opportunity.use-case.js';
import type { IInvestigationRepository } from '@/application/ports/output/repositories/investigation-repository.interface.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import { ACME, opportunityWorld } from '../opportunities/opportunity.fixtures.js';
import {
  InMemoryAutopilotPolicies,
  InMemoryAutopilotRuns,
} from '../../../../helpers/autopilot-repositories.mock.js';

export const NOW = new Date('2026-10-06T03:00:00Z');

export function completed(extra: Partial<WorkItemInvestigation> = {}): WorkItemInvestigation {
  return {
    id: 'inv-1',
    workItemId: 'wi-1',
    repositoryPath: '/work/pay',
    status: InvestigationStatus.Completed,
    hypotheses: [
      {
        number: 1,
        title: 'Cache',
        rootCause: 'stale',
        confidence: HypothesisConfidence.High,
        evidence: [],
        testPlan: 't',
        fixPlan: 'f',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

export function autopilotWorld() {
  const world = opportunityWorld();
  const policies = new InMemoryAutopilotPolicies();
  const runs = new InMemoryAutopilotRuns();
  const investigations = new Map<string, WorkItemInvestigation[]>();
  const investigationRepo = {
    listByWorkItem: vi.fn(async (id: string) => investigations.get(id) ?? []),
  } as unknown as IInvestigationRepository;
  const urgent = {
    execute: vi.fn(async () => [
      {
        workItem: {
          id: 'wi-1',
          identifierPrefix: 'PAY',
          sequenceId: 42,
          priority: Priority.Urgent,
        },
        project: { id: 'p-pay' },
        repositoryPath: '/work/pay',
      },
    ]),
  };
  const investigate = {
    start: vi.fn(async () => ({ ok: true, investigation: { id: 'inv-new' } })),
    run: vi.fn(async () => {
      const done = completed({ id: 'inv-new' });
      investigations.set('wi-1', [done]);
      return done;
    }),
  };
  const approve = {
    execute: vi.fn(async () => ({
      ok: true,
      feature: { id: 'feat-1' },
      started: Promise.resolve({}),
    })),
  };
  const board = {
    execute: vi.fn(async () => ({
      ok: true,
      board: {
        line: {
          inLine: [
            {
              opportunity: { id: 'opp-a', title: 'Dark mode', status: OpportunityStatus.Accepted },
            },
            { opportunity: { id: 'opp-b', title: 'SSO', status: OpportunityStatus.Building } },
          ],
        },
      },
    })),
  };
  const build = { execute: vi.fn(async () => ({ ok: true })) };
  const projects = {
    findById: vi.fn(async (id: string) =>
      id === 'p-pay' ? { id, slug: 'pay', name: 'Payments' } : null
    ),
    findBySlug: vi.fn(async (slug: string) =>
      slug === 'pay' ? { id: 'p-pay', slug, name: 'Payments' } : null
    ),
  } as unknown as IPmProjectRepository;

  const manage = new ManageAutopilotUseCase(
    policies,
    runs,
    world.spaces,
    world.productLines,
    projects
  );
  const pass = new RunAutopilotUseCase(
    policies,
    runs,
    urgent as unknown as ListUrgentWorkItemsUseCase,
    investigationRepo,
    investigate as unknown as InvestigateWorkItemUseCase,
    approve as unknown as ApproveHypothesisUseCase,
    board as unknown as GetOpportunityBoardUseCase,
    build as unknown as BuildOpportunityUseCase,
    world.spaces,
    world.productLines
  );
  return {
    ...world,
    ACME,
    policies,
    runs,
    investigations,
    urgent,
    investigate,
    approve,
    board,
    build,
    manage,
    pass,
  };
}
