/**
 * Budget accounting for one harness refinement (spec 150).
 *
 * Task-level recursion with budget k performs exactly R = 4k rollouts (k base,
 * 2k candidate probes, k finals) and P = 3k improver sessions (k INV, k DOM,
 * k compositions) in both recursion shapes. Selection and reflection are
 * recorded outside the identity. Adapted from Harness² `core/ledger.py`
 * (google-research/harness2, Apache-2.0).
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import type { HarnessRecursion } from '../generated/output';

export const ROLLOUTS_PER_K = 4;
export const SESSIONS_PER_K = 3;

export function expectedRollouts(k: number): number {
  return ROLLOUTS_PER_K * k;
}

export function expectedSessions(k: number): number {
  return SESSIONS_PER_K * k;
}

export class LedgerIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerIdentityError';
  }
}

interface LedgerEntry {
  kind: 'rollout' | 'session';
  label: string;
  costUsd: number;
}

const safeCost = (usd: number): number => (Number.isFinite(usd) && usd > 0 ? usd : 0);

export class RefinementLedger {
  private readonly entries: LedgerEntry[] = [];

  constructor(
    readonly recursion: HarnessRecursion,
    readonly k: number
  ) {
    if (!Number.isInteger(k) || k < 1) throw new Error(`k must be a positive integer, got ${k}`);
  }

  rollout(label: string, costUsd = 0): void {
    this.entries.push({ kind: 'rollout', label, costUsd: safeCost(costUsd) });
  }

  session(label: string, costUsd = 0): void {
    this.entries.push({ kind: 'session', label, costUsd: safeCost(costUsd) });
  }

  get rollouts(): number {
    return this.entries.filter((e) => e.kind === 'rollout').length;
  }

  get sessions(): number {
    return this.entries.filter((e) => e.kind === 'session').length;
  }

  get costUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  labels(kind: LedgerEntry['kind']): string[] {
    return this.entries.filter((e) => e.kind === kind).map((e) => e.label);
  }

  isOverBudget(capUsd: number): boolean {
    return this.costUsd >= capUsd;
  }

  /** Throws unless the ledger landed exactly on 4k rollouts and 3k sessions. */
  assertIdentity(): void {
    const r = expectedRollouts(this.k);
    const p = expectedSessions(this.k);
    if (this.rollouts !== r || this.sessions !== p) {
      throw new LedgerIdentityError(
        `refinement ledger (${this.recursion}, k=${this.k}) has ${this.rollouts} rollouts, expected ${r}; ${this.sessions} sessions, expected ${p}`
      );
    }
  }
}
