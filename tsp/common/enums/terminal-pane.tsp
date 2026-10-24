/**
 * @module Shep.Common.Enums.TerminalPane
 *
 * Opening a feature in a terminal pane from the feature console (`shep tui`,
 * spec 143): which multiplexer the console runs inside, what the pane shows,
 * where it opens, and how the request ended.
 */
@doc("A terminal multiplexer shep can open panes in")
enum TerminalMultiplexer {
  @doc("tmux, detected from TMUX")
  Tmux: "tmux",

  @doc("Zellij, detected from ZELLIJ")
  Zellij: "zellij",

  @doc("WezTerm's built-in multiplexer, detected from WEZTERM_PANE")
  WezTerm: "wezterm",

  @doc("kitty with remote control, detected from KITTY_WINDOW_ID")
  Kitty: "kitty",
}

@doc("What a feature pane shows")
enum FeaturePaneContent {
  @doc("An interactive shell in the feature's worktree")
  Shell: "shell",

  @doc("The feature's agent log, followed live")
  Log: "log",
}

@doc("Where a feature pane opens")
enum FeaturePanePlacement {
  @doc("Split beside the console")
  Split: "split",

  @doc("A new window or tab")
  Window: "window",
}

@doc("How a request to open a feature pane ended")
enum FeaturePaneOutcome {
  @doc("A pane opened in the multiplexer")
  Opened: "opened",

  @doc("No multiplexer: the caller runs the command in its own terminal")
  Inline: "inline",

  @doc("The pane could not be opened")
  Failed: "failed",
}
