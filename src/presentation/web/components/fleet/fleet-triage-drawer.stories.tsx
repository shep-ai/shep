import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
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
  {
    featureId: 'feat-6',
    featureName: 'Payment Retry',
    slug: 'payment-retry',
    priority: FleetTriagePriority.p2,
    category: FleetTriageCategory.crash,
    reason: 'Agent run failed: spawn ENOENT',
    runId: 'run-6',
    createdAt: NOW,
  },
];

/**
 * The working feed: every row links into its feature, the P1 gates approve
 * inline, the failed run retries inline, and the footer clears the gate backlog
 * or restarts every failed run — each behind a confirmation.
 */
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

/**
 * The feed is still being read. Skeleton rows rather than the all-clear: an
 * empty list mid-read is "not known yet", and saying "Nothing needs you right
 * now" to an operator whose fleet is on fire is the worst thing this surface
 * can do.
 */
export const Loading: Story = {
  args: {
    items: [],
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
    loading: true,
  },
};

/** A genuinely clear fleet — the read finished and found nothing. */
export const Empty: Story = {
  args: {
    items: [],
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
};

/**
 * Exceptions that exist but cannot be approved from here. The batch approve is
 * absent rather than disabled-at-zero, since there is nothing to explain — the
 * failed run below is still retryable, so that action remains.
 */
export const NothingApprovable: Story = {
  args: {
    items: ITEMS.filter((item) => item.category !== FleetTriageCategory.gate),
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
};

/**
 * Nothing this surface can act on at all: CI failures and merge conflicts need
 * the CI fix loop and a branch resolution rather than a restarted agent, so
 * neither batch button renders.
 */
export const NothingActionable: Story = {
  args: {
    items: ITEMS.filter(
      (item) =>
        item.category === FleetTriageCategory.ci_failed ||
        item.category === FleetTriageCategory.conflict ||
        item.category === FleetTriageCategory.warning
    ),
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
};

/**
 * The guardrail batch, one click away from the whole backlog.
 *
 * Nothing is approved until the operator confirms: the dialog says what the
 * rules will decide, and the toast afterwards names every gate that was left
 * for a human and why. With no rules configured this approves nothing and says
 * so — the flag is never a synonym for "approve all".
 */
export const ApproveLowRisk: Story = {
  args: {
    items: ITEMS,
    open: true,
    onOpenChange: noop,
    onRefresh: noop,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('fleet-triage-approve-low-risk'));
    await expect(page.getByTestId('fleet-triage-approve-low-risk-dialog')).toBeVisible();
  },
};
