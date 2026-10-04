import type { Meta, StoryObj } from '@storybook/react';
import { OpportunityWeightsForm } from './opportunity-weights-form';
import { BOARD, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof OpportunityWeightsForm> = {
  title: 'Features/Opportunities/OpportunityWeightsForm',
  component: OpportunityWeightsForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { weights: BOARD.weights, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
