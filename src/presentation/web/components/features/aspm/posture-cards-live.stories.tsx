import type { Meta, StoryObj } from '@storybook/react';

import { PostureCardsLive } from './posture-cards-live';
import type { PostureSummaryView } from './posture-cards';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof PostureCardsLive> = {
  title: 'Features/Aspm/PostureCardsLive',
  component: PostureCardsLive,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const populatedSummary: PostureSummaryView = {
  openBySeverity: [
    { severity: CanonicalSeverity.Critical, count: 2 },
    { severity: CanonicalSeverity.High, count: 7 },
    { severity: CanonicalSeverity.Medium, count: 18 },
    { severity: CanonicalSeverity.Low, count: 4 },
    { severity: CanonicalSeverity.Info, count: 1 },
  ],
  topAtRiskApplications: [{ applicationId: 'app-x', openFindingCount: 6, riskScoreSum: 220 }],
  kevOpenCount: 1,
  slaBreachCount: 0,
  exceptionCount: 0,
  aiReviewQueueDepth: 2,
  lastIngestedAt: '2026-05-19T09:30:00.000Z',
};

export const Default: Story = {
  args: { initialSummary: populatedSummary, initialError: null },
};

export const Loading: Story = {
  args: { initialSummary: null, initialError: null },
};

export const Error: Story = {
  args: { initialSummary: null, initialError: 'Lost connection to posture stream' },
};
