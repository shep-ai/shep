import type { Meta, StoryObj } from '@storybook/react';
import { PrCommentItem } from './pr-comment-item';
import {
  ADDRESSED_STATE,
  FAILED_STATE,
  INLINE_COMMENT,
  QUESTION_COMMENT,
} from './pr-comments-fixtures';

const meta: Meta<typeof PrCommentItem> = {
  title: 'Features/PrComments/PrCommentItem',
  component: PrCommentItem,
  args: { comment: INLINE_COMMENT },
  decorators: [
    (Story) => (
      <ul className="max-w-xl">
        <Story />
      </ul>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrCommentItem>;

export const Default: Story = {};
export const Conversation: Story = { args: { comment: QUESTION_COMMENT } };
export const Addressed: Story = { args: { comment: ADDRESSED_STATE.comments[0] } };
export const Failed: Story = { args: { comment: FAILED_STATE.comments[0] } };
