/**
 * Feature console key map (specs 142, 143, 145, 146, 147).
 *
 * Turns raw terminal input into the console's own key vocabulary. pi-tui
 * parses special keys in both legacy and Kitty keyboard protocol forms;
 * printable keys are decoded from Kitty CSI-u sequences when that protocol is
 * active (so `R` arrives as `R`, not as `shift+r`).
 */

import { decodeKittyPrintable, matchesKey } from '@mariozechner/pi-tui';
import {
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePanePlacement,
} from '@/domain/generated/output.js';

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
  Shell = 'shell',
  ShellWindow = 'shell-window',
  FollowLog = 'follow-log',
  FollowLogWindow = 'follow-log-window',
  Filter = 'filter',
  ClearFilter = 'clear-filter',
  CopyId = 'copy-id',
  Palette = 'palette',
  ControlCenter = 'control-center',
  Chat = 'chat',
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
  t: ConsoleKey.Shell,
  T: ConsoleKey.ShellWindow,
  f: ConsoleKey.FollowLog,
  F: ConsoleKey.FollowLogWindow,
  '/': ConsoleKey.Filter,
  ':': ConsoleKey.Palette,
  c: ConsoleKey.CopyId,
  C: ConsoleKey.ControlCenter,
  o: ConsoleKey.Chat,
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
  ['ctrl+p', ConsoleKey.Palette],
];

/** The console key for one input event, if it is one the console uses. */
export function resolveConsoleKey(data: string): ConsoleKey | undefined {
  for (const [id, key] of SPECIAL_KEYS) {
    if (matchesKey(data, id)) return key;
  }
  const printable = decodeKittyPrintable(data) ?? (data.length === 1 ? data : undefined);
  return printable === undefined ? undefined : PRINTABLE_KEYS[printable];
}

/** Keys that run an action directly (reject and stop open a prompt first). */
export const DIRECT_ACTIONS: Partial<Record<ConsoleKey, FeatureConsoleAction>> = {
  [ConsoleKey.Approve]: FeatureConsoleAction.Approve,
  [ConsoleKey.Resume]: FeatureConsoleAction.Resume,
};

/** Keys that open a terminal pane (spec 143): what it shows and where. */
export const PANE_KEYS: Partial<Record<ConsoleKey, [FeaturePaneContent, FeaturePanePlacement]>> = {
  [ConsoleKey.Shell]: [FeaturePaneContent.Shell, FeaturePanePlacement.Split],
  [ConsoleKey.ShellWindow]: [FeaturePaneContent.Shell, FeaturePanePlacement.Window],
  [ConsoleKey.FollowLog]: [FeaturePaneContent.Log, FeaturePanePlacement.Split],
  [ConsoleKey.FollowLogWindow]: [FeaturePaneContent.Log, FeaturePanePlacement.Window],
};
