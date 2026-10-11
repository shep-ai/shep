/**
 * Inline-UI-block registry (spec 134) — every block type maps to a renderer.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DecisionKind,
  DecisionResponseMode,
  InlineBlockType,
} from '@shepai/core/domain/generated/output';
import {
  INLINE_BLOCK_RENDERERS,
  InlineBlockView,
  inlineBlockFromChatBlock,
} from '@/components/common/inline-blocks';
import {
  htmlPreviewBlock,
  planCardBlock,
  specReviewBlock,
} from '@/components/common/chat-blocks/chat-block-fixtures';

describe('InlineBlockView', () => {
  it('has a renderer for every InlineBlockType', () => {
    expect(Object.keys(INLINE_BLOCK_RENDERERS).sort()).toEqual(
      Object.values(InlineBlockType).sort()
    );
  });

  it('renders a decision block through DecisionPanel', () => {
    render(
      <InlineBlockView
        block={{
          type: InlineBlockType.Decision,
          props: {
            onSubmit: vi.fn(),
            decision: {
              id: 'd1',
              kind: DecisionKind.AgentAsk,
              responseMode: DecisionResponseMode.Async,
              questions: [
                {
                  id: 'q1',
                  header: 'Retry',
                  question: 'Retry the flaky step?',
                  multiSelect: false,
                  allowCustom: false,
                  options: [{ id: 'yes', label: 'Yes', description: '' }],
                },
              ],
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('inline-block-decision')).toBeInTheDocument();
    expect(screen.getByTestId('decision-panel')).toHaveTextContent('Retry the flaky step?');
  });

  it.each([
    [specReviewBlock, InlineBlockType.SpecReview, 'Login PRD'],
    [planCardBlock, InlineBlockType.PlanCard, 'Add dark mode'],
    [htmlPreviewBlock, InlineBlockType.HtmlPreview, 'Pricing card'],
  ])('renders the chat block %# as its inline block type (spec 137)', (block, type, title) => {
    const inline = inlineBlockFromChatBlock(block);
    expect(inline.type).toBe(type);
    render(<InlineBlockView block={inline} />);
    expect(screen.getByTestId(`inline-block-${type}`)).toBeInTheDocument();
    expect(screen.getByTestId('chat-block')).toHaveTextContent(title);
  });
});
