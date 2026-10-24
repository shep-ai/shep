/**
 * Open Control Center Use Case (spec 146)
 *
 * One multiplexer window per requested feature, each following that feature's
 * agent log and named by the caller (the console names windows with each
 * feature's state). The multiplexer's own window list becomes the dashboard,
 * like `par control-center` and workmux. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import {
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  type TerminalMultiplexer,
} from '../../../domain/generated/output.js';
import type { ITerminalPaneLauncher } from '../../ports/output/services/terminal-pane-launcher.interface.js';
import { OpenFeaturePaneUseCase } from './open-feature-pane.use-case.js';

export interface OpenControlCenterInput {
  features: readonly { featureId: string; title: string }[];
  /** argv that runs this shep CLI (each window runs `<shepCommand> feat logs -f <id>`). */
  shepCommand: readonly string[];
  environment?: Readonly<Record<string, string>>;
}

export interface ControlCenterWindow {
  featureId: string;
  /** Absent where the multiplexer does not print one (Zellij): the window cannot be renamed. */
  windowId?: string;
}

export interface OpenControlCenterResult {
  outcome: FeaturePaneOutcome.Opened | FeaturePaneOutcome.Failed;
  multiplexer?: TerminalMultiplexer;
  windows: ControlCenterWindow[];
  message: string;
}

const NO_MULTIPLEXER_MESSAGE = 'The control center needs tmux, Zellij, WezTerm or kitty.';

@injectable()
export class OpenControlCenterUseCase {
  constructor(
    @inject(OpenFeaturePaneUseCase)
    private readonly openPane: OpenFeaturePaneUseCase,
    @inject('ITerminalPaneLauncher')
    private readonly launcher: ITerminalPaneLauncher
  ) {}

  async execute(input: OpenControlCenterInput): Promise<OpenControlCenterResult> {
    const multiplexer = this.launcher.detect();
    if (!multiplexer) {
      return { outcome: FeaturePaneOutcome.Failed, windows: [], message: NO_MULTIPLEXER_MESSAGE };
    }

    const windows: ControlCenterWindow[] = [];
    const failures: string[] = [];
    for (const { featureId, title } of input.features) {
      const result = await this.openPane.execute({
        featureId,
        content: FeaturePaneContent.Log,
        placement: FeaturePanePlacement.Window,
        shepCommand: input.shepCommand,
        ...(input.environment && { environment: input.environment }),
        title,
      });
      if (result.outcome !== FeaturePaneOutcome.Opened) {
        failures.push(result.message);
        continue;
      }
      windows.push({ featureId, ...(result.windowId && { windowId: result.windowId }) });
      // Not every multiplexer takes a tab name when it opens one (WezTerm's spawn does not).
      if (result.windowId) await this.nameWindow(multiplexer, result.windowId, title);
    }

    const opened = `Opened ${windows.length} ${windows.length === 1 ? 'window' : 'windows'} in ${multiplexer}`;
    const failed = failures.length > 0 ? `; ${failures.length} failed: ${failures[0]}` : '';
    return {
      outcome: windows.length > 0 ? FeaturePaneOutcome.Opened : FeaturePaneOutcome.Failed,
      multiplexer,
      windows,
      message: opened + failed,
    };
  }

  private async nameWindow(
    multiplexer: TerminalMultiplexer,
    windowId: string,
    title: string
  ): Promise<void> {
    try {
      await this.launcher.renameWindow(multiplexer, windowId, title);
    } catch {
      // The window opened; a name it could not take is cosmetic.
    }
  }
}
