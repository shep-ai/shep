import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { HypothesisCard } from './hypothesis-card';
import { COMPLETED_INVESTIGATION } from './bug-loop-fixtures';

const [likely, unlikely] = COMPLETED_INVESTIGATION.hypotheses;

const meta: Meta<typeof HypothesisCard> = {
  title: 'Features/BugLoop/HypothesisCard',
  component: HypothesisCard,
  args: { hypothesis: likely, canFix: true, approved: false, onFix: fn() },
};
export default meta;
type Story = StoryObj<typeof HypothesisCard>;

export const Default: Story = {};
export const LowConfidence: Story = { args: { hypothesis: unlikely } };
export const Fixing: Story = { args: { fixing: true } };
export const Approved: Story = { args: { canFix: false, approved: true } };
export const ReadOnly: Story = { args: { canFix: false } };
