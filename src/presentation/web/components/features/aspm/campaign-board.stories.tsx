import type { Meta, StoryObj } from '@storybook/react';
import { CampaignBoard, type CampaignBoardItem } from './campaign-board';
import {
  CampaignStatus,
  CanonicalSeverity,
  type RemediationCampaign,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof CampaignBoard> = {
  title: 'Features/Aspm/CampaignBoard',
  component: CampaignBoard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const APP_A = '11111111-1111-1111-1111-111111111111';
const APP_B = '22222222-2222-2222-2222-222222222222';

function makeCampaign(
  overrides: Partial<RemediationCampaign> & { id: string; name: string }
): RemediationCampaign {
  return {
    description: 'sprint description',
    targetQuery: {},
    status: CampaignStatus.Active,
    createdAt: new Date('2026-05-19T00:00:00Z'),
    updatedAt: new Date('2026-05-19T00:00:00Z'),
    ...overrides,
  };
}

const sampleItems: CampaignBoardItem[] = [
  {
    campaign: makeCampaign({
      id: 'c-1',
      name: 'Fix all KEV log4j',
      description: 'cross-cutting sprint across the fleet',
      targetQuery: { severities: [CanonicalSeverity.Critical], kev: true },
      status: CampaignStatus.Active,
      dueDate: new Date('2026-06-15T00:00:00Z'),
    }),
    progress: { total: 42, closed: 22, atRisk: 6, blocked: 2 },
  },
  {
    campaign: makeCampaign({
      id: 'c-2',
      name: 'Payments service hardening',
      description: 'High-severity findings only',
      targetQuery: {
        severities: [CanonicalSeverity.High],
        applicationIds: [APP_A],
      },
      status: CampaignStatus.Active,
    }),
    progress: { total: 18, closed: 4, atRisk: 9, blocked: 0 },
  },
  {
    campaign: makeCampaign({
      id: 'c-3',
      name: 'Secret rotation Q2',
      description: 'Tracks ingestion of new secret findings',
      targetQuery: { applicationIds: [APP_B] },
      status: CampaignStatus.Draft,
    }),
    progress: { total: 0, closed: 0, atRisk: 0, blocked: 0 },
  },
  {
    campaign: makeCampaign({
      id: 'c-4',
      name: 'Completed audit sweep',
      description: 'closed last week',
      targetQuery: {},
      status: CampaignStatus.Completed,
      closedAt: new Date('2026-05-10T00:00:00Z'),
    }),
    progress: { total: 75, closed: 75, atRisk: 0, blocked: 0 },
  },
];

export const Default: Story = {
  args: { items: sampleItems },
};

export const Loading: Story = {
  args: { items: [], loading: true },
};

export const Error: Story = {
  args: { items: [], error: 'Failed to load campaigns' },
};

export const Empty: Story = {
  args: { items: [] },
};

export const FilteredByApplication: Story = {
  args: { items: sampleItems, applicationFilter: APP_A },
};

export const Single: Story = {
  args: { items: [sampleItems[0]] },
};
