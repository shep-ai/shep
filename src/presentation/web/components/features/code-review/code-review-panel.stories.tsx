import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { CodeReviewPanel } from './code-review-panel';
import { CodeReviewStatus, CommentSide } from '@shepai/core/domain/generated/output';
import type { CodeReview } from '@shepai/core/domain/generated/output';

const now = new Date();

const sampleComments = [
  {
    path: 'src/services/auth.ts',
    line: 42,
    body: 'This function does not validate the input before using it in a SQL query, which could lead to SQL injection.',
    side: CommentSide.Right,
    inDiffRange: true,
  },
  {
    path: 'src/services/auth.ts',
    line: 58,
    body: 'Consider adding rate limiting to prevent brute-force attacks.',
    side: CommentSide.Right,
    suggestion: 'const limiter = rateLimit({\n  windowMs: 15 * 60 * 1000,\n  max: 100,\n});',
    inDiffRange: true,
  },
  {
    path: 'src/controllers/user.controller.ts',
    line: 15,
    body: 'Missing error handling for the async operation.',
    side: CommentSide.Right,
    inDiffRange: true,
  },
  {
    path: 'src/utils/helpers.ts',
    line: 100,
    body: 'This related utility function also has a potential issue but is outside the current diff range.',
    side: CommentSide.Right,
    inDiffRange: false,
  },
];

const completedReview: CodeReview = {
  id: 'review-1',
  repositoryPath: '/home/user/project',
  prNumber: 42,
  prUrl: 'https://github.com/org/repo/pull/42',
  status: CodeReviewStatus.Completed,
  summary:
    'Found 4 issues: 1 critical SQL injection vulnerability, 1 missing rate limiting, 1 missing error handler, and 1 related issue outside the diff range.',
  comments: sampleComments,
  createdAt: now,
  updatedAt: now,
};

const meta: Meta<typeof CodeReviewPanel> = {
  title: 'Features/CodeReview/CodeReviewPanel',
  component: CodeReviewPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
  args: {
    onPostToGitHub: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    review: completedReview,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const Error: Story = {
  args: {
    error: 'Failed to run code review: Agent timed out after 120 seconds.',
  },
};

export const Empty: Story = {
  args: {
    review: {
      ...completedReview,
      summary: 'No issues found. The code changes look well-structured and follow best practices.',
      comments: [],
    },
  },
};

export const Posted: Story = {
  args: {
    review: {
      ...completedReview,
      status: CodeReviewStatus.Posted,
      reviewUrl: 'https://github.com/org/repo/pull/42#pullrequestreview-123456',
    },
  },
};

export const FailedReview: Story = {
  args: {
    review: {
      ...completedReview,
      status: CodeReviewStatus.Failed,
      summary: undefined,
      comments: [],
      errorMessage: 'Agent failed: structured output could not be parsed after 3 repair attempts.',
    },
  },
};

export const InProgress: Story = {
  args: {
    review: {
      ...completedReview,
      status: CodeReviewStatus.InProgress,
      summary: undefined,
      comments: [],
    },
  },
};
