/**
 * Feature console app (spec 142).
 *
 * Wires the view to the core: polls the snapshot, runs actions, keeps the log
 * pane fresh, and restores the terminal on the way out. It takes the use
 * cases as plain functions so it carries no DI or infrastructure knowledge.
 */

import type { TFunction } from 'i18next';
import { TUI, type Terminal } from '@mariozechner/pi-tui';
import type { FeatureConsoleAction } from '@/domain/generated/output.js';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { FeatureConsoleView, type FeatureConsoleIntents } from './feature-console-view.js';

/** How often the console re-reads every feature. */
export const DEFAULT_REFRESH_INTERVAL_MS = 2000;
/** Log lines fetched per refresh; the pane shows as many as fit. */
const LOG_TAIL_LINES = 200;
const TERMINATION_SIGNALS = ['SIGTERM', 'SIGHUP'] as const;

export interface FeatureConsoleAppDeps {
  t: TFunction;
  terminal: Terminal;
  loadSnapshot: () => Promise<FeatureConsoleSnapshot>;
  runAction: (
    featureId: string,
    action: FeatureConsoleAction,
    feedback?: string
  ) => Promise<FeatureConsoleActionResult>;
  loadLogTail: (featureId: string, maxLines: number) => Promise<FeatureLogTail>;
  refreshIntervalMs?: number;
}

/** Runs the console until the user quits. Always restores the terminal. */
export function runFeatureConsole(deps: FeatureConsoleAppDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    const tui = new TUI(deps.terminal);
    let refreshing = false;
    let logFeatureId: string | undefined;
    let finished = false;

    const intents: FeatureConsoleIntents = {
      runAction: (row, action, feedback) => void runAction(row, action, feedback),
      showLog: (row) => {
        logFeatureId = row?.featureId;
        if (row) void refreshLog();
      },
      quit: () => finish(),
      requestRender: () => tui.requestRender(),
    };

    const view = new FeatureConsoleView({
      t: deps.t,
      rows: () => deps.terminal.rows,
      intents,
    });

    async function refresh(): Promise<void> {
      if (refreshing || finished) return;
      refreshing = true;
      try {
        view.setSnapshot(await deps.loadSnapshot());
      } catch (error) {
        view.setRefreshError(messageOf(error));
      } finally {
        refreshing = false;
      }
      if (logFeatureId) await refreshLog();
      render();
    }

    async function refreshLog(): Promise<void> {
      const featureId = logFeatureId;
      if (!featureId) return;
      try {
        const tail = await deps.loadLogTail(featureId, LOG_TAIL_LINES);
        // The user may have moved on while the read was in flight.
        if (featureId === logFeatureId) view.setLog(tail);
      } catch (error) {
        view.setLog({ lines: [messageOf(error)] });
      }
      render();
    }

    async function runAction(
      row: FeatureConsoleRow,
      action: FeatureConsoleAction,
      feedback?: string
    ): Promise<void> {
      view.setBusy(deps.t(`tui:console.progress.${action}`, { name: row.name }));
      render();
      try {
        view.setStatus(await deps.runAction(row.featureId, action, feedback));
      } catch (error) {
        view.setStatus({ ok: false, message: messageOf(error) });
      } finally {
        view.setBusy(undefined);
      }
      await refresh();
    }

    function render(): void {
      if (!finished) tui.requestRender();
    }

    const interval = setInterval(
      () => void refresh(),
      deps.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    );

    function finish(): void {
      if (finished) return;
      finished = true;
      clearInterval(interval);
      for (const signal of TERMINATION_SIGNALS) process.off(signal, finish);
      tui.stop();
      resolve();
    }

    for (const signal of TERMINATION_SIGNALS) process.once(signal, finish);

    tui.addChild(view);
    tui.setFocus(view);
    try {
      tui.start();
    } catch (error) {
      finish();
      throw error;
    }
    void refresh();
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
