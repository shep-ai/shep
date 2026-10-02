/**
 * The turn ledger (spec 119): a compact, state-derived list of what the agent
 * already did this task. It replaces transcript replay in query-aware mode —
 * one line per action, pointing at chunks instead of repeating output.
 */

export interface LedgerEntry {
  turn: number;
  action: string;
  outcome: string;
  chunkId?: string;
}

/** Most recent entries kept verbatim; older ones are counted. */
export const LEDGER_RECENT_LIMIT = 30;

export class TurnLedger {
  private readonly entries: LedgerEntry[] = [];

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  render(): string {
    if (this.entries.length === 0) return 'No actions yet.';
    const recent = this.entries.slice(-LEDGER_RECENT_LIMIT);
    const older = this.entries.length - recent.length;
    const lines = recent.map(
      (e) => `${e.turn}. ${e.action} → ${e.outcome}${e.chunkId ? ` [chunk ${e.chunkId}]` : ''}`
    );
    return `${older > 0 ? `(${older} earlier actions omitted)\n` : ''}${lines.join('\n')}`;
  }
}
