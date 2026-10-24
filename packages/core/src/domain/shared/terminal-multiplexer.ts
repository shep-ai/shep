/**
 * Terminal multiplexer detection (spec 143).
 *
 * A multiplexer counts only when its session variable proves the process runs
 * inside a live session that can take a split command. TERM and TERM_PROGRAM
 * are not proof: they survive into nested shells and ssh sessions that have no
 * multiplexer to talk to.
 *
 * The order follows workmux: tmux, Zellij, WezTerm, kitty. tmux or Zellij
 * running inside a WezTerm or kitty window is the session that should split.
 */

import { TerminalMultiplexer } from '../generated/output';

/** Names a multiplexer to use instead of detecting one, or `none` to turn panes off. */
export const MULTIPLEXER_OVERRIDE_VARIABLE = 'SHEP_MULTIPLEXER';
const OVERRIDE_NONE = 'none';

export type EnvironmentRecord = Readonly<Record<string, string | undefined>>;

const SESSION_VARIABLES: readonly [string, TerminalMultiplexer][] = [
  ['TMUX', TerminalMultiplexer.Tmux],
  ['ZELLIJ', TerminalMultiplexer.Zellij],
  ['WEZTERM_PANE', TerminalMultiplexer.WezTerm],
  ['KITTY_WINDOW_ID', TerminalMultiplexer.Kitty],
];

const KNOWN = new Set<string>(Object.values(TerminalMultiplexer));

/** The multiplexer this process runs inside, if any. */
export function detectTerminalMultiplexer(env: EnvironmentRecord): TerminalMultiplexer | undefined {
  const override = env[MULTIPLEXER_OVERRIDE_VARIABLE]?.trim().toLowerCase();
  if (override === OVERRIDE_NONE) return undefined;
  if (override && KNOWN.has(override)) return override as TerminalMultiplexer;
  return SESSION_VARIABLES.find(([name]) => Boolean(env[name]))?.[1];
}
