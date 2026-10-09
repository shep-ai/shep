'use client';

import type { ReactNode } from 'react';
import { InlineBlockType } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { DecisionPanel, type DecisionPanelProps } from '@/components/common/decision-panel';

/** A decision the user answers inline. */
export interface DecisionInlineBlock {
  type: InlineBlockType.Decision;
  props: DecisionPanelProps;
}

/**
 * Rich blocks rendered inline in a conversation or an inbox (spec 134). Add a
 * member to `InlineBlockType` (tsp/ui/inline-block.tsp), a variant here, and
 * its renderer below — the total registry makes a missing renderer a compile
 * error.
 */
export type InlineBlock = DecisionInlineBlock;

type InlineBlockRenderers = {
  [T in InlineBlockType]: (block: Extract<InlineBlock, { type: T }>) => ReactNode;
};

export const INLINE_BLOCK_RENDERERS: InlineBlockRenderers = {
  [InlineBlockType.Decision]: (block) => <DecisionPanel {...block.props} />,
};

export interface InlineBlockViewProps {
  block: InlineBlock;
  className?: string;
}

export function InlineBlockView({ block, className }: InlineBlockViewProps) {
  const renderBlock = INLINE_BLOCK_RENDERERS[block.type];
  return (
    <div data-testid={`inline-block-${block.type}`} className={cn('w-full', className)}>
      {renderBlock(block)}
    </div>
  );
}
