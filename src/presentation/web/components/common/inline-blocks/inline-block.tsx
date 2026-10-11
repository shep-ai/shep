'use client';

import type { ReactNode } from 'react';
import {
  ChatBlockType,
  InlineBlockType,
  type ChatBlock,
  type ChatBlockResponse,
} from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { DecisionPanel, type DecisionPanelProps } from '@/components/common/decision-panel';
import {
  HtmlPreviewChatBlock,
  PlanCardBlock,
  SpecReviewBlock,
  type ChatBlockRespond,
  type ChatBlockViewProps,
} from '@/components/common/chat-blocks';

/** A decision the user answers inline. */
export interface DecisionInlineBlock {
  type: InlineBlockType.Decision;
  props: DecisionPanelProps;
}

/** A spec or PRD to approve or send back (spec 137). */
export interface SpecReviewInlineBlock {
  type: InlineBlockType.SpecReview;
  props: ChatBlockViewProps;
}

/** A self-contained HTML page in a sandboxed frame (spec 137). */
export interface HtmlPreviewInlineBlock {
  type: InlineBlockType.HtmlPreview;
  props: ChatBlockViewProps;
}

/** A plan to implement or refine (spec 137). */
export interface PlanCardInlineBlock {
  type: InlineBlockType.PlanCard;
  props: ChatBlockViewProps;
}

/**
 * Rich blocks rendered inline in a conversation or an inbox (spec 134). Add a
 * member to `InlineBlockType` (tsp/ui/inline-block.tsp), a variant here, and
 * its renderer below — the total registry makes a missing renderer a compile
 * error.
 */
export type InlineBlock =
  | DecisionInlineBlock
  | SpecReviewInlineBlock
  | HtmlPreviewInlineBlock
  | PlanCardInlineBlock;

type InlineBlockRenderers = {
  [T in InlineBlockType]: (block: Extract<InlineBlock, { type: T }>) => ReactNode;
};

export const INLINE_BLOCK_RENDERERS: InlineBlockRenderers = {
  [InlineBlockType.Decision]: (block) => <DecisionPanel {...block.props} />,
  [InlineBlockType.SpecReview]: (block) => <SpecReviewBlock {...block.props} />,
  [InlineBlockType.HtmlPreview]: (block) => <HtmlPreviewChatBlock {...block.props} />,
  [InlineBlockType.PlanCard]: (block) => <PlanCardBlock {...block.props} />,
};

/** Which inline block renders each chat block an agent posts. */
const INLINE_BLOCK_FOR_CHAT_BLOCK = {
  [ChatBlockType.SpecReview]: InlineBlockType.SpecReview,
  [ChatBlockType.HtmlPreview]: InlineBlockType.HtmlPreview,
  [ChatBlockType.PlanCard]: InlineBlockType.PlanCard,
} as const satisfies Record<ChatBlockType, InlineBlockType>;

/** The inline block for a chat block, its answer if any, and the responder. */
export function inlineBlockFromChatBlock(
  block: ChatBlock,
  response?: ChatBlockResponse,
  onRespond?: ChatBlockRespond
): InlineBlock {
  const props: ChatBlockViewProps = { block, response, onRespond };
  return { type: INLINE_BLOCK_FOR_CHAT_BLOCK[block.type], props } as InlineBlock;
}

export interface InlineBlockViewProps {
  block: InlineBlock;
  className?: string;
}

export function InlineBlockView({ block, className }: InlineBlockViewProps) {
  const renderBlock = INLINE_BLOCK_RENDERERS[block.type] as (block: InlineBlock) => ReactNode;
  return (
    <div data-testid={`inline-block-${block.type}`} className={cn('w-full', className)}>
      {renderBlock(block)}
    </div>
  );
}
