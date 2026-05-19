import type { Meta, StoryObj } from '@storybook/react';

import { RiskTrendChart, type TrendChartBucket } from './risk-trend-chart';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof RiskTrendChart> = {
  title: 'Features/Aspm/RiskTrendChart',
  component: RiskTrendChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const DAY_MS = 24 * 60 * 60 * 1000;
const startMs = Date.UTC(2026, 3, 20);

function bucket(
  offset: number,
  mods: Partial<Record<CanonicalSeverity, number>>
): TrendChartBucket {
  return {
    bucketStart: new Date(startMs + offset * DAY_MS).toISOString(),
    countsBySeverity: [
      { severity: CanonicalSeverity.Critical, count: mods[CanonicalSeverity.Critical] ?? 0 },
      { severity: CanonicalSeverity.High, count: mods[CanonicalSeverity.High] ?? 0 },
      { severity: CanonicalSeverity.Medium, count: mods[CanonicalSeverity.Medium] ?? 0 },
      { severity: CanonicalSeverity.Low, count: mods[CanonicalSeverity.Low] ?? 0 },
      { severity: CanonicalSeverity.Info, count: mods[CanonicalSeverity.Info] ?? 0 },
    ],
  };
}

const trend: TrendChartBucket[] = Array.from({ length: 30 }).map((_, i) =>
  bucket(i, {
    [CanonicalSeverity.Critical]: Math.max(0, 4 - Math.floor(i / 8)),
    [CanonicalSeverity.High]: 6 + Math.floor(i / 3),
    [CanonicalSeverity.Medium]: 15 + Math.floor(Math.sin(i / 3) * 4),
    [CanonicalSeverity.Low]: 3 + (i % 5),
    [CanonicalSeverity.Info]: 1,
  })
);

export const Default: Story = { args: { buckets: trend } };

export const Loading: Story = { args: { loading: true } };

export const Error: Story = { args: { error: 'Trend service unavailable' } };

export const Empty: Story = { args: { buckets: [] } };

export const CriticalsOnly: Story = {
  args: { buckets: trend, visibleSeverities: [CanonicalSeverity.Critical] },
};
