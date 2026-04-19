import type { Meta, StoryObj } from '@storybook/react';
import { ReviewCommentCard } from './review-comment-card';
import { CommentSide } from '@shepai/core/domain/generated/output';
import type { ReviewComment } from '@shepai/core/domain/generated/output';

const baseComment: ReviewComment = {
  path: 'src/services/auth.ts',
  line: 42,
  body: 'This function does not validate the input before using it in a SQL query, which could lead to SQL injection.',
  side: CommentSide.Right,
  inDiffRange: true,
};

const meta: Meta<typeof ReviewCommentCard> = {
  title: 'Features/CodeReview/ReviewCommentCard',
  component: ReviewCommentCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { comment: baseComment },
};

export const WithSuggestion: Story = {
  args: {
    comment: {
      ...baseComment,
      body: 'Use parameterized queries to prevent SQL injection.',
      suggestion:
        'const result = await db.query(\n  "SELECT * FROM users WHERE id = ?",\n  [userId]\n);',
    },
  },
};

export const MultiLine: Story = {
  args: {
    comment: {
      ...baseComment,
      startLine: 38,
      line: 45,
      body: 'This entire block should be wrapped in a try/catch to handle potential database connection errors gracefully.',
    },
  },
};

export const NoSuggestion: Story = {
  args: {
    comment: {
      ...baseComment,
      body: 'Consider adding a timeout to this API call to prevent hanging requests in production.',
    },
  },
};

export const OutsideDiffRange: Story = {
  args: {
    comment: {
      ...baseComment,
      inDiffRange: false,
      body: 'This related function also has the same vulnerability but is outside the current diff range.',
    },
  },
};

export const LongFilePath: Story = {
  args: {
    comment: {
      ...baseComment,
      path: 'packages/core/src/infrastructure/services/authentication/oauth-provider.service.ts',
      body: 'Token refresh logic should handle expired refresh tokens gracefully.',
    },
  },
};
