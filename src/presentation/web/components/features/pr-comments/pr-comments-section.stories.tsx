import type { Meta, StoryObj } from '@storybook/react';
import { PrCommentsSection } from './pr-comments-section';
import {
  ADDRESSED_STATE,
  FAILED_STATE,
  PENDING_STATE,
  RUNNING_STATE,
} from './pr-comments-fixtures';

const meta: Meta<typeof PrCommentsSection> = {
  title: 'Features/PrComments/PrCommentsSection',
  component: PrCommentsSection,
  args: { featureId: 'feature-1' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-lg border">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrCommentsSection>;

/** Comments waiting to be addressed. */
export const Default: Story = { args: { initial: PENDING_STATE } };
export const Empty: Story = { args: { initial: { comments: [], rounds: [] } } };
export const Addressing: Story = { args: { initial: RUNNING_STATE } };
export const Addressed: Story = { args: { initial: ADDRESSED_STATE } };
export const Failed: Story = { args: { initial: FAILED_STATE } };
