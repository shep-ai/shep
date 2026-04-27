'use client';

/**
 * Terminal Tab — thin lazy shell.
 *
 * The xterm.js-using implementation lives in `./terminal-tab-inner` and
 * is dynamically imported so the ~120KB of @xterm/* JS isn't on the
 * critical path of any application page that doesn't open this tab.
 * Re-exports the same prop type so callers don't need to know the
 * splitting happened.
 */

import dynamic from 'next/dynamic';
import type { TerminalTabProps } from './terminal-tab-inner';

export type { TerminalTabProps } from './terminal-tab-inner';

const LazyTerminalTab = dynamic(
  () => import('./terminal-tab-inner').then((m) => m.TerminalTabInner),
  { ssr: false }
);

export function TerminalTab(props: TerminalTabProps) {
  return <LazyTerminalTab {...props} />;
}
