import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DecisionResponseMode } from '@shepai/core/domain/generated/output';
import { buildApprovalGateDecision } from '@shepai/core/domain/shared/decision-builders';
import { DecisionPanel } from './decision-panel';
import { agentAskDecision, chatDecision } from './decision-fixtures';

const meta: Meta<typeof DecisionPanel> = {
  title: 'Composed/DecisionPanel',
  component: DecisionPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { decision: chatDecision, onSubmit: fn() },
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

/** Two questions, paged 1/2; the recommended Grid option is preselected. Press 1–3. */
export const Default: Story = {
  args: { decision: chatDecision },
};

export const SingleQuestionWithDeadline: Story = {
  args: { decision: agentAskDecision },
};

export const ApprovalGate: Story = {
  args: { decision: buildApprovalGateDecision('story-gate', 'merge') },
};

export const Submitting: Story = {
  args: { decision: agentAskDecision, isSubmitting: true },
};

export const NotResumable: Story = {
  args: {
    decision: { ...chatDecision, responseMode: DecisionResponseMode.NotResumable },
  },
};

export const Answered: Story = {
  args: {
    decision: chatDecision,
    responses: [
      { questionId: 'q1', optionIds: ['grid'] },
      { questionId: 'q2', optionIds: ['web', 'ios'] },
    ],
  },
};

export const ReadOnly: Story = {
  args: { decision: agentAskDecision, onSubmit: undefined },
};
