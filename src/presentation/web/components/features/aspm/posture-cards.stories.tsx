import type { Meta, StoryObj } from '@storybook/react';

import { PostureCards, type PostureSummaryView } from './posture-cards';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof PostureCards> = {
  title: 'Features/Aspm/PostureCards',
  component: PostureCards,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const populatedSummary: PostureSummaryView = {
  openBySeverity: [
    { severity: CanonicalSeverity.Critical, count: 3 },
    { severity: CanonicalSeverity.High, count: 12 },
    { severity: CanonicalSeverity.Medium, count: 27 },
    { severity: CanonicalSeverity.Low, count: 8 },
    { severity: CanonicalSeverity.Info, count: 4 },
  ],
  topAtRiskApplications: [
    { applicationId: 'app-a', openFindingCount: 11, riskScoreSum: 480 },
    { applicationId: 'app-b', openFindingCount: 8, riskScoreSum: 320 },
  ],
  kevOpenCount: 2,
  slaBreachCount: 4,
  exceptionCount: 1,
  aiReviewQueueDepth: 5,
  lastIngestedAt: '2026-05-19T09:00:00.000Z',
};

export const Default: Story = { args: { summary: populatedSummary } };

export const Loading: Story = { args: { loading: true } };

export const Error: Story = { args: { error: 'Unable to load posture' } };

export const Empty: Story = { args: { summary: null } };

export const ZeroFindings: Story = {
  args: {
    summary: {
      openBySeverity: [
        { severity: CanonicalSeverity.Critical, count: 0 },
        { severity: CanonicalSeverity.High, count: 0 },
        { severity: CanonicalSeverity.Medium, count: 0 },
        { severity: CanonicalSeverity.Low, count: 0 },
        { severity: CanonicalSeverity.Info, count: 0 },
      ],
      topAtRiskApplications: [],
      kevOpenCount: 0,
      slaBreachCount: 0,
      exceptionCount: 0,
      aiReviewQueueDepth: 0,
      lastIngestedAt: null,
    },
  },
};
