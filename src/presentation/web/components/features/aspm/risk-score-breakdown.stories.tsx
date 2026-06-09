import type { Meta, StoryObj } from '@storybook/react';

import { RiskScoreBreakdown } from './risk-score-breakdown';
import type { RiskScoreBreakdown as Breakdown } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof RiskScoreBreakdown> = {
  title: 'Features/Aspm/RiskScoreBreakdown',
  component: RiskScoreBreakdown,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function breakdown(overrides: Partial<Breakdown>): Breakdown {
  return {
    total: 0,
    cvssContribution: 0,
    epssContribution: 0,
    kevContribution: 0,
    exposureContribution: 0,
    criticalityContribution: 0,
    dataClassificationContribution: 0,
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    breakdown: breakdown({
      total: 72,
      cvssContribution: 28,
      epssContribution: 7.5,
      kevContribution: 20,
      exposureContribution: 7.5,
      criticalityContribution: 6,
      dataClassificationContribution: 3.5,
    }),
  },
};

export const Loading: Story = { args: { loading: true } };

export const Error: Story = {
  args: { error: 'Failed to compute risk score (network error)' },
};

export const Empty: Story = { args: { breakdown: null } };

export const EmptyWithComputeButton: Story = {
  args: {
    breakdown: null,
    onCompute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    },
  },
};

export const CvssOnly: Story = {
  args: {
    breakdown: breakdown({
      total: 28,
      cvssContribution: 28,
    }),
  },
};

export const EpssBoosted: Story = {
  args: {
    breakdown: breakdown({
      total: 42,
      cvssContribution: 28,
      epssContribution: 12,
      criticalityContribution: 2,
    }),
  },
};

export const KevListedHighRisk: Story = {
  args: {
    breakdown: breakdown({
      total: 95,
      cvssContribution: 35,
      epssContribution: 13.5,
      kevContribution: 20,
      exposureContribution: 15,
      criticalityContribution: 8,
      dataClassificationContribution: 3.5,
    }),
  },
};

export const NoCveSecretFinding: Story = {
  args: {
    breakdown: breakdown({
      total: 51,
      cvssContribution: 28,
      // No CVE → no EPSS / KEV contribution.
      exposureContribution: 15,
      criticalityContribution: 6,
      dataClassificationContribution: 2,
    }),
  },
};
