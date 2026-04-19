import type { Meta, StoryObj } from '@storybook/react';
import { ReviewStatusBadge } from './review-status-badge';
import { CodeReviewStatus } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ReviewStatusBadge> = {
  title: 'Features/CodeReview/ReviewStatusBadge',
  component: ReviewStatusBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: { status: CodeReviewStatus.Pending },
};

export const InProgress: Story = {
  args: { status: CodeReviewStatus.InProgress },
};

export const Completed: Story = {
  args: { status: CodeReviewStatus.Completed },
};

export const Posted: Story = {
  args: { status: CodeReviewStatus.Posted },
};

export const Failed: Story = {
  args: { status: CodeReviewStatus.Failed },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Object.values(CodeReviewStatus).map((status) => (
        <ReviewStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
