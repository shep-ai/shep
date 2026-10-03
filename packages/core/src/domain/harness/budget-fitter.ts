/**
 * Token-budget fitting for context plans (spec 119, docs/04 "Budget fitting").
 *
 * Pure function. Order of operations when the plan is over budget:
 * 1. downgrade full → long, lowest priority first;
 * 2. downgrade long → short, lowest priority first;
 * 3. hide, lowest priority first.
 * Pinned chunks are never touched. Visible-locked chunks (the current task)
 * may be downgraded but never hidden. Every change carries a reason code, so a
 * plan never shrinks silently.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { ChunkVisibility } from '../generated/output';

export const BUDGET_DOWNGRADE_REASON = 'budget_downgrade';
export const BUDGET_HIDDEN_REASON = 'budget_hidden';

export interface BudgetItem {
  chunkId: string;
  visibility: ChunkVisibility;
  /** Higher keeps detail longer. */
  priority: number;
  /** `pinned`: never changed. `visible`: may downgrade, never hide. */
  lock: 'none' | 'visible' | 'pinned';
  /** Estimated tokens of each rendered level. */
  tokens: Record<ChunkVisibility, number>;
}

export interface FittedItem {
  chunkId: string;
  visibility: ChunkVisibility;
  tokens: number;
  reasonCode?: string;
}

export interface FitResult {
  items: FittedItem[];
  totalTokens: number;
  overBudget: boolean;
}

const DOWNGRADE_STEPS: readonly [ChunkVisibility, ChunkVisibility][] = [
  [ChunkVisibility.Full, ChunkVisibility.Long],
  [ChunkVisibility.Long, ChunkVisibility.Short],
];

export function fitToBudget(items: readonly BudgetItem[], budget: number): FitResult {
  const state = items.map((item) => ({
    item,
    visibility: item.visibility,
    reasonCode: undefined as string | undefined,
  }));
  const cost = (s: (typeof state)[number]) => s.item.tokens[s.visibility] ?? 0;
  let total = state.reduce((sum, s) => sum + cost(s), 0);

  const byPriority = [...state].sort((a, b) => a.item.priority - b.item.priority);

  for (const [from, to] of DOWNGRADE_STEPS) {
    for (const s of byPriority) {
      if (total <= budget) break;
      if (s.item.lock === 'pinned' || s.visibility !== from) continue;
      total -= cost(s);
      s.visibility = to;
      s.reasonCode = BUDGET_DOWNGRADE_REASON;
      total += cost(s);
    }
  }

  for (const s of byPriority) {
    if (total <= budget) break;
    if (s.item.lock !== 'none' || s.visibility === ChunkVisibility.Hidden) continue;
    total -= cost(s);
    s.visibility = ChunkVisibility.Hidden;
    s.reasonCode = BUDGET_HIDDEN_REASON;
  }

  return {
    items: state.map((s) => ({
      chunkId: s.item.chunkId,
      visibility: s.visibility,
      tokens: cost(s),
      ...(s.reasonCode !== undefined && { reasonCode: s.reasonCode }),
    })),
    totalTokens: total,
    overBudget: total > budget,
  };
}
