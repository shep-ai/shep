import type { Meta, StoryObj } from '@storybook/react';
import { fixturePlan } from './harness-fixtures';
import { HarnessPlanTable } from './harness-plan-table';

const meta: Meta<typeof HarnessPlanTable> = {
  title: 'Harness/HarnessPlanTable',
  component: HarnessPlanTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessPlanTable>;

/** One turn's plan: every candidate with visibility, tokens shown/raw, relevance and reason. */
export const Default: Story = {
  args: { plan: fixturePlan, onView: () => undefined, onWhy: () => undefined },
};

/** A degraded shadow plan (provider down, conservative fallback). */
export const DegradedShadow: Story = {
  args: {
    plan: { ...fixturePlan, degraded: true, shadow: true },
    onView: () => undefined,
    onWhy: () => undefined,
  },
};
