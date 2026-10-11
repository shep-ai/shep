import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ChatBlockAction } from '@shepai/core/domain/generated/output';
import { SpecReviewBlock } from './spec-review-block';
import { specReviewBlock } from './chat-block-fixtures';

const meta: Meta<typeof SpecReviewBlock> = {
  title: 'Composed/ChatBlocks/SpecReviewBlock',
  component: SpecReviewBlock,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { block: specReviewBlock, onRespond: fn() },
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

/** Waiting for review: Approve, or Request changes with a note. */
export const Default: Story = {};

export const Approved: Story = {
  args: { response: { blockId: specReviewBlock.id, action: ChatBlockAction.Approve } },
};

export const ChangesRequested: Story = {
  args: {
    response: {
      blockId: specReviewBlock.id,
      action: ChatBlockAction.RequestChanges,
      note: 'Add SSO for enterprise accounts',
    },
  },
};

/** Outside a live chat the block is read-only. */
export const ReadOnly: Story = {
  args: { onRespond: undefined },
};
