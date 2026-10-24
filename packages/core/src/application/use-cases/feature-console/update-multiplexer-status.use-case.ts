/**
 * Update Multiplexer Status Use Case (spec 146)
 *
 * Keeps what the multiplexer shows in step with the features: renames the
 * windows the console opened (so the window list reads ◆ / ● / ✓ per feature)
 * and publishes status values such as tmux's `@shep_status`. Never throws; a
 * window that can no longer be renamed is reported so the caller stops
 * tracking it.
 */

import { inject, injectable } from 'tsyringe';
import type { ITerminalPaneLauncher } from '../../ports/output/services/terminal-pane-launcher.interface.js';

export interface UpdateMultiplexerStatusInput {
  renames: readonly { windowId: string; title: string }[];
  /** Status values to publish; omitted when nothing changed. */
  status?: Readonly<Record<string, string>>;
}

export interface UpdateMultiplexerStatusResult {
  /** Windows the multiplexer refused to rename, most likely closed by the user. */
  goneWindowIds: string[];
}

@injectable()
export class UpdateMultiplexerStatusUseCase {
  constructor(
    @inject('ITerminalPaneLauncher')
    private readonly launcher: ITerminalPaneLauncher
  ) {}

  async execute(input: UpdateMultiplexerStatusInput): Promise<UpdateMultiplexerStatusResult> {
    const goneWindowIds: string[] = [];
    // Outside a multiplexer there is nothing to name or publish to.
    const multiplexer = this.launcher.detect();
    if (!multiplexer) return { goneWindowIds };
    for (const { windowId, title } of input.renames) {
      try {
        await this.launcher.renameWindow(multiplexer, windowId, title);
      } catch {
        goneWindowIds.push(windowId);
      }
    }
    if (input.status) {
      try {
        await this.launcher.publishStatus(multiplexer, input.status);
      } catch {
        // A status bar that missed one update gets the next one.
      }
    }
    return { goneWindowIds };
  }
}
