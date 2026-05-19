import type { Meta, StoryObj } from '@storybook/react';

import { AssetRiskGraph } from './asset-risk-graph';

const meta: Meta<typeof AssetRiskGraph> = {
  title: 'Features/Aspm/AssetRiskGraph',
  component: AssetRiskGraph,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ownerNames = new Map([
  ['owner-platform', '@platform-security'],
  ['owner-payments', '@payments-team'],
]);

const applications = [
  { id: 'app-a', name: 'payments-service', ownerId: 'owner-payments' },
  { id: 'app-b', name: 'checkout-web', ownerId: 'owner-payments' },
  { id: 'app-c', name: 'identity-core', ownerId: 'owner-platform' },
  { id: 'app-d', name: 'billing-worker', ownerId: 'owner-platform' },
  { id: 'app-e', name: 'public-api', ownerId: undefined },
];

const atRisk = [
  { applicationId: 'app-a', openFindingCount: 12, riskScoreSum: 480 },
  { applicationId: 'app-b', openFindingCount: 5, riskScoreSum: 220 },
  { applicationId: 'app-c', openFindingCount: 7, riskScoreSum: 310 },
];

export const Default: Story = {
  args: { applications, atRisk, ownerNames },
};

export const Loading: Story = {
  args: { applications: [], atRisk: [], loading: true },
};

export const Error: Story = {
  args: { applications: [], atRisk: [], error: 'Inventory unavailable' },
};

export const Empty: Story = {
  args: { applications: [], atRisk: [] },
};

export const TabularFallback: Story = {
  args: { applications, atRisk, forceTabular: true },
};
