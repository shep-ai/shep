import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { InlineBlockType } from '@shepai/core/domain/generated/output';
import { InlineBlockView } from './inline-block';
import { agentAskDecision } from '../decision-panel/decision-fixtures';

const meta: Meta<typeof InlineBlockView> = {
  title: 'Composed/InlineBlockView',
  component: InlineBlockView,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    block: {
      type: InlineBlockType.Decision,
      props: { decision: agentAskDecision, onSubmit: fn() },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The decision block — the only block type today. */
export const Decision: Story = {};
