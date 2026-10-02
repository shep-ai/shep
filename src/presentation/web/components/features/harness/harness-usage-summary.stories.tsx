import type { Meta, StoryObj } from '@storybook/react';
import { fixtureSessionDetail } from './harness-fixtures';
import { HarnessUsageSummaryView } from './harness-usage-summary';

const meta: Meta<typeof HarnessUsageSummaryView> = {
  title: 'Harness/HarnessUsageSummary',
  component: HarnessUsageSummaryView,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessUsageSummaryView>;

/** Usage of a finished task. */
export const Default: Story = { args: { usage: fixtureSessionDetail.usage } };

/** No cost reported by the backend (shown as –, never summed as zero). */
export const NoCost: Story = {
  args: { usage: { ...fixtureSessionDetail.usage, costUsd: undefined } },
};
