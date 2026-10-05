/** Sample factory data for the Factory stories (spec 132). */

import type { AutopilotRun } from '@shepai/core/domain/generated/output';
import type { FactoryStatus } from '@shepai/core/application/use-cases/autopilot/get-factory-status.use-case';
import type { RunAction } from '@/hooks/use-run-action';
import type { FactoryProject, FactorySpaceOption } from './factory-types';

const T = new Date('2026-10-06T03:00:00Z');

export const SPACES: FactorySpaceOption[] = [
  { id: 'space-acme', name: 'Acme', slug: 'acme' },
  { id: 'space-personal', name: 'Personal', slug: 'personal' },
];

export const PROJECTS: FactoryProject[] = [
  { id: 'p-pay', name: 'Payments' },
  { id: 'p-growth', name: 'Growth' },
];

export const RUN: AutopilotRun = {
  id: 'run-1',
  spaceId: 'space-acme',
  investigated: ['PAY-42'],
  fixed: ['PAY-42'],
  built: ['opp-checkout'],
  errors: ['PAY-40: no repository to investigate in'],
  createdAt: T,
  updatedAt: T,
};

export const QUIET_RUN: AutopilotRun = {
  ...RUN,
  id: 'run-0',
  investigated: [],
  fixed: [],
  built: [],
  errors: [],
  createdAt: new Date('2026-10-06T02:00:00Z'),
};

export const STATUS: FactoryStatus = {
  space: SPACES[0],
  line: { usedHours: 12, capacityHours: 16, inLine: 2, waiting: 1 },
  building: 2,
  openIncidents: 1,
  actionsAwaitingApproval: 1,
  pendingOutcomes: 3,
  customersToTell: 2,
  autopilot: {
    policy: {
      spaceId: 'space-acme',
      investigateUrgent: true,
      fixConfident: true,
      mergeFixes: false,
      fillLine: true,
      projectId: 'p-pay',
      dailyFixBudget: 3,
      updatedAt: T,
    },
    isDefault: false,
    lastRun: RUN,
  },
};

export const runInStory: RunAction = async (action) => (await action()).ok;
