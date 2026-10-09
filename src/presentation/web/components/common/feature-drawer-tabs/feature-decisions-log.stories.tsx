import type { Meta, StoryObj } from '@storybook/react';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type AgentQuestion,
} from '@shepai/core/domain/generated/output';
import { FeatureDecisionsLog } from './feature-decisions-log';

function question(overrides: Partial<AgentQuestion>): AgentQuestion {
  return {
    id: 'q-1',
    agentRunId: 'run-1',
    featureId: 'feat-1',
    kind: AgentQuestionKind.blocking,
    prompt: 'The users table has 40M rows. How should the new column be added?',
    answerer: AgentQuestionAnswerer.either,
    status: AgentQuestionStatus.pending,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const meta: Meta<typeof FeatureDecisionsLog> = {
  title: 'Composed/FeatureDecisionsLog',
  component: FeatureDecisionsLog,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    decisions: [
      question({
        id: 'q-defaulted',
        status: AgentQuestionStatus.expired,
        answer: 'Online, nullable column',
        answeredBy: 'system:deadline',
      }),
      question({
        id: 'q-answered',
        prompt: 'Which charting library?',
        status: AgentQuestionStatus.answered,
        answer: 'Recharts',
        answeredBy: 'user:web',
      }),
      question({ id: 'q-pending', prompt: 'Keep the legacy endpoint?' }),
      question({
        id: 'q-cancelled',
        prompt: 'Rename the table?',
        status: AgentQuestionStatus.cancelled,
      }),
    ],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { decisions: [] } };
