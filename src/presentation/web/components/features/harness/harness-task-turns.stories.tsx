import type { Meta, StoryObj } from '@storybook/react';
import { fixtureSessionDetail } from './harness-fixtures';
import { HarnessTaskTurns } from './harness-task-turns';

const meta: Meta<typeof HarnessTaskTurns> = {
  title: 'Harness/HarnessTaskTurns',
  component: HarnessTaskTurns,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessTaskTurns>;

/** Turn list on the left; the selected turn's context plan on the right. */
export const Default: Story = { args: { task: fixtureSessionDetail.tasks[0] } };
