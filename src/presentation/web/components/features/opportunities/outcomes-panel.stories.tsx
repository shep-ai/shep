import type { Meta, StoryObj } from '@storybook/react';
import { OutcomesPanel } from './outcomes-panel';
import { runInStory } from './opportunities-fixtures';
import { CALIBRATION, PENDING_OUTCOME, SOLVED_OUTCOME } from './outcomes-fixtures';

const meta: Meta<typeof OutcomesPanel> = {
  title: 'Features/Opportunities/OutcomesPanel',
  component: OutcomesPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { outcomes: [PENDING_OUTCOME, SOLVED_OUTCOME], calibration: CALIBRATION },
};

export const NothingShipped: Story = {
  args: { outcomes: [], calibration: { judged: 0, solved: 0, timed: 0 } },
};
