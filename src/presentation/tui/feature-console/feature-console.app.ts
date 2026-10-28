/**
 * Feature console app (specs 142, 143, 145, 146, 147).
 *
 * Wires the view to the core: polls the snapshot, runs actions, keeps the log
 * pane fresh, opens terminal panes (stepping aside for an inline command when
 * there is no multiplexer), alerts when a feature starts needing the user, and
 * tells the terminal host (Herdr, spec 149) what shep is doing, and
 * restores the terminal on the way out. It takes the use cases as plain
 * functions so it carries no DI or infrastructure knowledge.
 */

import type { TFunction } from 'i18next';
import { TUI, type Terminal } from '@mariozechner/pi-tui';
import {
  AgentActivityState,
  FeaturePaneContent,
  FeaturePaneOutcome,
  type FeatureConsoleAction,
  type FeaturePanePlacement,
} from '@/domain/generated/output.js';
import type { OpenFeaturePaneResult } from '@/application/use-cases/feature-console/open-feature-pane.use-case.js';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
  FeatureLogTail,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { FeatureConsoleView, type FeatureConsoleIntents } from './feature-console-view.js';
import { clipboardSequence } from './terminal-clipboard.js';
import { ControlCenter, type ControlCenterDeps } from './control-center.js';
import { ConsoleChat, type ConsoleChatDeps } from './console-chat.js';

/** How often the console re-reads every feature. */
export const DEFAULT_REFRESH_INTERVAL_MS = 2000;
/** Log lines fetched per refresh; the pane shows as many as fit. */
const LOG_TAIL_LINES = 200;
const TERMINATION_SIGNALS = ['SIGTERM', 'SIGHUP'] as const;

export interface FeatureConsoleAppDeps extends ConsoleChatDeps {
  t: TFunction;
  terminal: Terminal;
  loadSnapshot: () => Promise<FeatureConsoleSnapshot>;
  runAction: (
    featureId: string,
    action: FeatureConsoleAction,
    feedback?: string
  ) => Promise<FeatureConsoleActionResult>;
  loadLogTail: (featureId: string, maxLines: number) => Promise<FeatureLogTail>;
  openPane: (
    featureId: string,
    content: FeaturePaneContent,
    placement: FeaturePanePlacement
  ) => Promise<OpenFeaturePaneResult>;
  /** Run a command in this terminal while the console is stopped; resolves when it exits. */
  runInline: (plan: InlineCommand) => Promise<void>;
  /** Release the paused admission queue, as `shep fleet resume` does (spec 148). */
  releaseQueue: () => Promise<FeatureConsoleActionResult>;
  /** Alert the user (bell, terminal notification); undefined turns alerts off. */
  notify?: (message: string) => void;
  openControlCenter: ControlCenterDeps['openControlCenter'];
  updateMultiplexer: ControlCenterDeps['updateMultiplexer'];
  /** Tell the terminal host this console runs in what shep is doing (spec 149). */
  reportActivity?: (report: { state: AgentActivityState; message?: string }) => void;
  /** Tell the terminal host the console is leaving its pane. */
  releaseActivity?: () => Promise<void>;
  refreshIntervalMs?: number;
}

export interface InlineCommand {
  cwd: string;
  command: string[];
  /** One line printed before the command runs: what it is and how to come back. */
  banner: string;
}

/** Runs the console until the user quits. Always restores the terminal. */
export function runFeatureConsole(deps: FeatureConsoleAppDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    const tui = new TUI(deps.terminal);
    let refreshing = false;
    let logFeatureId: string | undefined;
    let finished = false;
    /** True while an inline command owns the terminal. */
    let suspended = false;
    /** Features needing the user at the last snapshot; undefined before the first. */
    let needingUser: Set<string> | undefined;
    let title: string | undefined;
    let latest: FeatureConsoleSnapshot | undefined;
    const controlCenter = new ControlCenter(deps);

    const intents: FeatureConsoleIntents = {
      runAction: (row, action, feedback) => void runAction(row, action, feedback),
      showLog: (row) => {
        logFeatureId = row?.featureId;
        if (row) void refreshLog();
      },
      openPane: (row, content, placement) => void openPane(row, content, placement),
      releaseQueue: () => void releaseQueue(),
      copyId: (row) => {
        deps.terminal.write(clipboardSequence(row.featureId));
        view.setStatus({
          ok: true,
          message: deps.t('tui:console.copied', { name: row.name, id: row.featureId }),
        });
        render();
      },
      openControlCenter: () => void openControlCenter(),
      openChat: (row) => chat.attach(row.featureId),
      closeChat: () => chat.detach(),
      sendChat: (row, text) => void chat.send(row.featureId, text),
      answerChat: (row, answers) => void chat.answer(row.featureId, answers),
      quit: () => finish(),
      requestRender: () => tui.requestRender(),
    };

    const view = new FeatureConsoleView({
      t: deps.t,
      rows: () => deps.terminal.rows,
      intents,
    });
    const chat = new ConsoleChat(deps, {
      chat: (c) => view.setChat(c),
      notice: (n) => view.setChatNotice(n),
      render: () => render(),
    });

    async function refresh(): Promise<void> {
      if (refreshing || finished) return;
      refreshing = true;
      try {
        const snapshot = await deps.loadSnapshot();
        latest = snapshot;
        view.setSnapshot(snapshot);
        noticeAttention(snapshot);
        reportActivity(snapshot);
        await controlCenter.sync(snapshot).catch(() => undefined);
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

    /**
     * Release the pause and re-read (spec 148).
     *
     * Never clear the banner here: the store is the source of truth, so a
     * refused release leaves the pause visible, exactly as the web status bar
     * keeps its badge until the re-read says otherwise.
     */
    async function releaseQueue(): Promise<void> {
      view.setBusy(deps.t('tui:console.progress.releaseQueue'));
      render();
      try {
        view.setStatus(await deps.releaseQueue());
      } catch (error) {
        view.setStatus({ ok: false, message: messageOf(error) });
      } finally {
        view.setBusy(undefined);
      }
      await refresh();
    }

    async function openControlCenter(): Promise<void> {
      view.setStatus(await controlCenter.open(latest?.rows ?? []));
      render();
    }

    async function openPane(
      row: FeatureConsoleRow,
      content: FeaturePaneContent,
      placement: FeaturePanePlacement
    ): Promise<void> {
      let result: OpenFeaturePaneResult;
      try {
        result = await deps.openPane(row.featureId, content, placement);
      } catch (error) {
        result = { outcome: FeaturePaneOutcome.Failed, message: messageOf(error) };
      }
      if (result.outcome !== FeaturePaneOutcome.Inline) {
        view.setStatus({
          ok: result.outcome === FeaturePaneOutcome.Opened,
          message: result.message,
        });
        return render();
      }
      const banner = deps.t(
        content === FeaturePaneContent.Log ? 'tui:console.inline.log' : 'tui:console.inline.shell',
        { cwd: result.cwd, name: row.name }
      );
      await stepAside({ cwd: result.cwd, command: result.command, banner });
    }

    /** Hand the terminal to a command, then take it back and redraw everything. */
    async function stepAside(plan: InlineCommand): Promise<void> {
      if (finished || suspended) return;
      suspended = true;
      tui.stop();
      try {
        await deps.runInline(plan);
      } catch (error) {
        view.setStatus({ ok: false, message: messageOf(error) });
      } finally {
        suspended = false;
      }
      if (finished) return;
      tui.start();
      tui.requestRender(true);
    }

    /** Alert for features that started needing the user; keep the title's count current. */
    function noticeAttention(snapshot: FeatureConsoleSnapshot): void {
      const needing = snapshot.rows.filter((r) => r.needsAttention);
      const newly = needing.filter((r) => needingUser && !needingUser.has(r.featureId));
      needingUser = new Set(needing.map((r) => r.featureId));
      for (const row of newly) deps.notify?.(deps.t('tui:console.notify.body', { name: row.name }));

      const next =
        needing.length > 0
          ? deps.t('tui:console.windowTitle.attention', { count: needing.length })
          : deps.t('tui:console.windowTitle.idle');
      if (next !== title && !suspended) {
        title = next;
        deps.terminal.setTitle(next);
      }
    }

    /** The overall activity, and how many features wait on the user when any do. */
    function reportActivity(snapshot: FeatureConsoleSnapshot): void {
      const { activity: state, needsAttention } = snapshot.summary;
      try {
        deps.reportActivity?.(
          state === AgentActivityState.Blocked
            ? {
                state,
                message: deps.t('tui:console.hostStatus.blocked', { count: needsAttention }),
              }
            : { state }
        );
      } catch {
        // A host that cannot be told shows less; the console carries on.
      }
    }

    function render(): void {
      if (!finished && !suspended) tui.requestRender();
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
      if (!suspended) tui.stop();
      // Chat agents run in this process: stop them before handing control back.
      void chat
        .stopAll()
        .catch(() => undefined)
        .then(() => deps.releaseActivity?.())
        .catch(() => undefined)
        .finally(resolve);
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
