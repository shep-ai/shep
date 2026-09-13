import type { Meta, StoryObj } from '@storybook/react';
import { FleetTriageDrawer } from './fleet-triage-drawer';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

/** Stories are inert: no-op handlers keep the controls clickable without a body. */
const noop = (): void => undefined;

const meta: Meta<typeof FleetTriageDrawer> = {
  title: 'Fleet/FleetTriageDrawer',
  component: FleetTriageDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = '2026-09-11T12:00:00.000Z';

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
    featureId: 'feat-2',
    featureName: 'Auth SSO',
    slug: 'auth-sso',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.question,
    reason: 'Blocking question: Should we support SAML 2.0 or OIDC?',
    runId: 'run-2',
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
  {
    featureId: 'feat-4',
    featureName: 'Profile Modal',
    slug: 'profile-modal',
    priority: FleetTriagePriority.p2,
    category: FleetTriageCategory.conflict,
    reason: 'Pull request has merge conflicts',
    createdAt: NOW,
  },
  {
    featureId: 'feat-5',
    featureName: 'Stalled Import',
    slug: 'stalled-import',
    priority: FleetTriagePriority.p3,
    category: FleetTriageCategory.warning,
    reason: 'Agent run has been running for more than 45 minutes',
    createdAt: NOW,
  },
];

export const Default: Story = {
  args: {
    items: ITEMS,
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
};

export const Refreshing: Story = {
  args: {
    items: ITEMS,
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
    refreshing: true,
  },
};

export const Empty: Story = {
  args: {
    items: [],
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
};
