/**
 * Feature console key map (spec 142).
 *
 * Turns raw terminal input into the console's own key vocabulary. pi-tui
 * parses special keys in both legacy and Kitty keyboard protocol forms;
 * printable keys are decoded from Kitty CSI-u sequences when that protocol is
 * active (so `R` arrives as `R`, not as `shift+r`).
 */

import { decodeKittyPrintable, matchesKey } from '@mariozechner/pi-tui';

export enum ConsoleKey {
  Up = 'up',
  Down = 'down',
  PageUp = 'page-up',
  PageDown = 'page-down',
  First = 'first',
  Last = 'last',
  Details = 'details',
  Log = 'log',
  Approve = 'approve',
  Reject = 'reject',
  Stop = 'stop',
  Resume = 'resume',
  Help = 'help',
  Quit = 'quit',
  Escape = 'escape',
  Confirm = 'confirm',
  Deny = 'deny',
}

const PRINTABLE_KEYS: Readonly<Record<string, ConsoleKey>> = {
  k: ConsoleKey.Up,
  j: ConsoleKey.Down,
  g: ConsoleKey.First,
  G: ConsoleKey.Last,
  i: ConsoleKey.Details,
  l: ConsoleKey.Log,
  a: ConsoleKey.Approve,
  r: ConsoleKey.Reject,
  s: ConsoleKey.Stop,
  R: ConsoleKey.Resume,
  '?': ConsoleKey.Help,
  q: ConsoleKey.Quit,
  y: ConsoleKey.Confirm,
  n: ConsoleKey.Deny,
};

const SPECIAL_KEYS: readonly [Parameters<typeof matchesKey>[1], ConsoleKey][] = [
  ['up', ConsoleKey.Up],
  ['down', ConsoleKey.Down],
  ['pageUp', ConsoleKey.PageUp],
  ['pageDown', ConsoleKey.PageDown],
  ['home', ConsoleKey.First],
  ['end', ConsoleKey.Last],
  ['enter', ConsoleKey.Details],
  ['escape', ConsoleKey.Escape],
  ['ctrl+c', ConsoleKey.Quit],
];

/** The console key for one input event, if it is one the console uses. */
export function resolveConsoleKey(data: string): ConsoleKey | undefined {
  for (const [id, key] of SPECIAL_KEYS) {
    if (matchesKey(data, id)) return key;
  }
  const printable = decodeKittyPrintable(data) ?? (data.length === 1 ? data : undefined);
  return printable === undefined ? undefined : PRINTABLE_KEYS[printable];
}
