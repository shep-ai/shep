/**
 * Terminal Pane Launcher Interface (specs 143, 146)
 *
 * Output port for the terminal multiplexer the current process runs inside
 * (tmux, Zellij, WezTerm, kitty): open panes and windows, rename windows, and
 * publish status values. Implementations build argv arrays only, never shell
 * strings.
 */

import type {
  FeaturePanePlacement,
  TerminalMultiplexer,
} from '../../../../domain/generated/output.js';

export interface TerminalPaneRequest {
  multiplexer: TerminalMultiplexer;
  placement: FeaturePanePlacement;
  /** Absolute directory the pane starts in. */
  cwd: string;
  /** Pane, tab or window name where the multiplexer shows one. */
  title: string;
  /** Program and arguments to run; undefined opens the user's shell. */
  command?: readonly string[];
  /** Variables the pane must see, such as SHEP_HOME. */
  environment: Readonly<Record<string, string>>;
  /** Move focus to the new pane (a shell) or keep it on the caller (a log). */
  focus: boolean;
}

export interface OpenedPane {
  /** The pane or window id the multiplexer printed, when it prints one. */
  id?: string;
}

export interface ITerminalPaneLauncher {
  /** The multiplexer this process runs inside, if any. */
  detect(): TerminalMultiplexer | undefined;

  /**
   * Open the pane.
   *
   * @returns The new pane or window id when the multiplexer prints one (tmux, WezTerm, kitty)
   * @throws Error with a message fit to show the user when the multiplexer refuses
   */
  open(request: TerminalPaneRequest): Promise<OpenedPane>;

  /**
   * Rename a window or tab by the id `open` returned. Does nothing where the multiplexer
   * cannot rename an unfocused window (Zellij).
   *
   * @throws Error when the multiplexer refuses, for example because the window was closed
   */
  renameWindow(multiplexer: TerminalMultiplexer, id: string, title: string): Promise<void>;

  /**
   * Set status values the multiplexer can show (tmux user options such as `@shep_status`).
   * Does nothing for multiplexers without such values.
   */
  publishStatus(
    multiplexer: TerminalMultiplexer,
    values: Readonly<Record<string, string>>
  ): Promise<void>;

  /** argv of the user's interactive shell, for running one without a multiplexer. */
  defaultShell(): string[];
}
