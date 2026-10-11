import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ChatBlockAction } from '@shepai/core/domain/generated/output';
import { PlanCardBlock } from './plan-card-block';
import { planCardBlock } from './chat-block-fixtures';

const meta: Meta<typeof PlanCardBlock> = {
  title: 'Composed/ChatBlocks/PlanCardBlock',
  component: PlanCardBlock,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { block: planCardBlock, onRespond: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Implement as proposed, or Refine with a note (T3 Code's plan pattern). */
export const Default: Story = {};

export const Implementing: Story = {
  args: { response: { blockId: planCardBlock.id, action: ChatBlockAction.Implement } },
};

export const RefinementRequested: Story = {
  args: {
    response: { blockId: planCardBlock.id, action: ChatBlockAction.Refine, note: 'Skip step 3' },
  },
};
