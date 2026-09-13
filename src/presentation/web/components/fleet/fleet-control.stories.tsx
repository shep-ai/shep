import type { Meta, StoryObj } from '@storybook/react';
import { FleetControl } from './fleet-control';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetOverview,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof FleetControl> = {
  title: 'Fleet/FleetControl',
  component: FleetControl,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = '2026-09-11T12:00:00.000Z';

const OVERVIEW: FleetOverview = {
  counts: {
    total: 52,
    cruising: 42,
    queued: 5,
    attentionNeeded: 3,
    failed: 2,
    waitingApproval: 3,
    blockedQuestions: 1,
  },
  circuitBreakerTripped: false,
  activeTriageCount: 2,
  consecutiveFailures: 0,
  timestamp: NOW,
};

const ITEMS: FleetTriageItem[] = [
  {
    featureId: 'feat-1',
    featureName: 'Needs Plan Approval',
    slug: 'needs-plan',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.gate,
    reason: 'Waiting on the plan approval gate',
    runId: 'run-1',
    gateType: 'plan',
    createdAt: NOW,
  },
  {
    featureId: 'feat-3',
    featureName: 'CSV Export',
    slug: 'csv-export',
    priority: FleetTriagePriority.p2,
    category: FleetTriageCategory.ci_failed,
    reason: 'CI is failing on the pull request',
    runId: 'run-3',
    createdAt: NOW,
  },
];

/** Server-rendered snapshot: the bar paints immediately, the drawer opens on click. */
export const Default: Story = {
  args: {
    initialData: { overview: OVERVIEW, triageItems: ITEMS },
  },
};

export const CircuitBreakerTripped: Story = {
  args: {
    initialData: {
      overview: {
        ...OVERVIEW,
        counts: { ...OVERVIEW.counts, failed: 6, attentionNeeded: 7 },
        circuitBreakerTripped: true,
        circuitBreakerReason:
          'Consecutive failure threshold reached (4/4 runs failed in the last 15m)',
      },
      triageItems: ITEMS,
    },
  },
};

/** An empty fleet renders nothing — there is nothing to report. */
export const EmptyFleet: Story = {
  args: {
    initialData: {
      overview: {
        ...OVERVIEW,
        counts: {
          total: 0,
          cruising: 0,
          queued: 0,
          attentionNeeded: 0,
          failed: 0,
          waitingApproval: 0,
          blockedQuestions: 0,
        },
      },
      triageItems: [],
    },
  },
};
