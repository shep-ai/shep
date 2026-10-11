import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { InlineBlockType } from '@shepai/core/domain/generated/output';
import { InlineBlockView } from './inline-block';
import { agentAskDecision } from '../decision-panel/decision-fixtures';
import { inlineBlockFromChatBlock } from './inline-block';
import {
  htmlPreviewBlock,
  planCardBlock,
  specReviewBlock,
} from '../chat-blocks/chat-block-fixtures';

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

/** A decision the user answers inline (spec 134). */
export const Decision: Story = {};

/** A spec to approve or send back (spec 137). */
export const SpecReview: Story = {
  args: { block: inlineBlockFromChatBlock(specReviewBlock, undefined, fn()) },
};

/** A sandboxed HTML preview (spec 137). */
export const HtmlPreview: Story = {
  args: { block: inlineBlockFromChatBlock(htmlPreviewBlock) },
};

/** A plan to implement or refine (spec 137). */
export const PlanCard: Story = {
  args: { block: inlineBlockFromChatBlock(planCardBlock, undefined, fn()) },
};
