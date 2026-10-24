/**
 * Feature console layout (spec 142): where the roster and the pane go.
 *
 * Wide terminals put the pane beside the roster; narrow ones stack it below,
 * and very short ones drop it.
 */

import { fit, paint } from './console-format.js';

/** At or above this width the pane sits beside the roster instead of below it. */
const SPLIT_MIN_WIDTH = 110;
const SPLIT_ROSTER_SHARE = 0.6;
const SPLIT_DIVIDER = ' │ ';
const STACKED_PANE_SHARE = 0.45;
const STACKED_PANE_MAX = 9;
/** Below this body height there is no room for a pane at all. */
const MIN_BODY_FOR_PANE = 6;

type Region = (width: number, height: number) => string[];

/** The body: roster and pane, exactly `height` lines. */
export function composeBody(width: number, height: number, roster: Region, pane: Region): string[] {
  if (width >= SPLIT_MIN_WIDTH) {
    const rosterWidth = Math.floor(width * SPLIT_ROSTER_SHARE);
    const paneWidth = width - rosterWidth - SPLIT_DIVIDER.length;
    const left = padTo(roster(rosterWidth, height), height);
    const right = padTo(pane(paneWidth, height), height);
    return left.map(
      (line, i) => fit(line, rosterWidth) + paint.border(SPLIT_DIVIDER) + fit(right[i], paneWidth)
    );
  }
  if (height < MIN_BODY_FOR_PANE) return roster(width, height);
  const paneHeight = Math.min(STACKED_PANE_MAX, Math.floor(height * STACKED_PANE_SHARE));
  const rosterHeight = height - paneHeight - 1;
  return [
    ...roster(width, rosterHeight),
    paint.border('─'.repeat(width)),
    ...padTo(pane(width, paneHeight), paneHeight),
  ];
}

/** Exactly `height` lines: cut, or padded with empty lines. */
export function padTo(lines: string[], height: number): string[] {
  if (lines.length >= height) return lines.slice(0, height);
  return [...lines, ...Array.from({ length: height - lines.length }, () => '')];
}
