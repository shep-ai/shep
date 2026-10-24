/**
 * Terminal notifications (spec 143).
 *
 * The escape sequence that tells the user a feature needs them. The terminal
 * decides how to show it (a desktop notification when unfocused, a tab badge),
 * and it reaches the right tab or pane, which a separate desktop notifier
 * cannot. Sources: oh-my-pi's notifier, Codex's `notification_method`.
 *
 * - iTerm2: OSC 9. WezTerm and Ghostty: OSC 777. kitty: OSC 99.
 * - Any other terminal: a bell.
 * - tmux: the OSC wrapped in DCS passthrough (needs `allow-passthrough on`),
 *   plus a bell so tmux flags the window either way.
 * - Zellij: a bell only; it drops OSC sequences and has no passthrough.
 */

import type { EnvironmentRecord } from '@/domain/shared/terminal-multiplexer.js';
import { sanitizeText } from './console-format.js';

const ESC = '\x1b';
const BEL = '\x07';
const ST = `${ESC}\\`;

type OscBuilder = (title: string, body: string) => string;

const OSC_9: OscBuilder = (title, body) => `${ESC}]9;${title}: ${body}${BEL}`;
const OSC_777: OscBuilder = (title, body) => `${ESC}]777;notify;${title};${body}${BEL}`;
const OSC_99: OscBuilder = (title, body) => `${ESC}]99;;${title}: ${body}${ST}`;

/** TERM_PROGRAM values, plus iTerm2's LC_TERMINAL, which survives into tmux and ssh. */
const BY_PROGRAM: Readonly<Record<string, OscBuilder>> = {
  'iTerm.app': OSC_9,
  iTerm2: OSC_9,
  WezTerm: OSC_777,
  ghostty: OSC_777,
};

function oscFor(env: EnvironmentRecord): OscBuilder | undefined {
  if (env.KITTY_WINDOW_ID) return OSC_99;
  return BY_PROGRAM[env.TERM_PROGRAM ?? ''] ?? BY_PROGRAM[env.LC_TERMINAL ?? ''];
}

function tmuxPassthrough(sequence: string): string {
  return `${ESC}Ptmux;${sequence.replaceAll(ESC, ESC + ESC)}${ST}`;
}

/** The bytes to write to the terminal to alert the user. */
export function terminalNotification(env: EnvironmentRecord, title: string, body: string): string {
  // The live session decides, not SHEP_MULTIPLEXER: that override picks where
  // panes open, but tmux still sits between us and the terminal.
  if (env.ZELLIJ) return BEL;
  const osc = oscFor(env);
  if (!osc) return BEL;
  const sequence = osc(sanitizeText(title), sanitizeText(body));
  return env.TMUX ? tmuxPassthrough(sequence) + BEL : sequence;
}
