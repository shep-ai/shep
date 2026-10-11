import type { Meta, StoryObj } from '@storybook/react';
import { AnsweredDecisionRow } from './answered-decision-row';
import { chatDecision } from './decision-fixtures';

const meta: Meta<typeof AnsweredDecisionRow> = {
  title: 'Composed/AnsweredDecisionRow',
  component: AnsweredDecisionRow,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    decision: chatDecision,
    responses: [
      { questionId: 'q1', optionIds: ['grid'] },
      { questionId: 'q2', optionIds: ['web', 'android'] },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TypedAnswer: Story = {
  args: {
    decision: { ...chatDecision, questions: [chatDecision.questions[0]] },
    responses: [{ questionId: 'q1', optionIds: [], customText: 'A kanban board, like Linear' }],
  },
};
