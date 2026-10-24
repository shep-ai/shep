/**
 * runFeatureConsole Unit Tests (specs 142, 143)
 *
 * The app wires the view to the use cases: it polls the snapshot (never two
 * reads at once), runs actions and shows their result, keeps the log pane
 * fresh, and on quit stops polling and restores the terminal.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { TFunction } from 'i18next';

import { initI18n } from '@/presentation/tui/i18n.js';
import {
  runFeatureConsole,
  type FeatureConsoleAppDeps,
} from '@/presentation/tui/feature-console/feature-console.app.js';
import {
  AgentRunStatus,
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  TerminalMultiplexer,
  FeatureState,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { FakeTerminal } from '@tests/helpers/tui/fake-terminal.js';

const REFRESH_MS = 25;

function gate(name: string): FeatureConsoleRow {
  return {
    featureId: `${name}-id`,
    shortId: name.slice(0, 8),
    name,
    repositoryName: 'acme',
    repositoryPath: '/acme',
    branch: `feat/${name}`,
    lifecycle: SdlcLifecycle.Requirements,
    state: FeatureState.ActionRequired,
    phase: 'requirements',
    runId: 'run-1',
    runStatus: AgentRunStatus.waitingApproval,
    elapsedMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    pendingQuestions: 0,
    needsAttention: true,
    actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
    updatedAt: new Date(),
  };
}

const snapshotOf = (...rows: FeatureConsoleRow[]): FeatureConsoleSnapshot => ({
  generatedAt: new Date(),
  rows,
  summary: {
    total: rows.length,
    needsAttention: rows.length,
    running: 0,
    waiting: 0,
    failed: 0,
    done: 0,
  },
});

// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\x1b\[[0-9;?<>=]*[A-Za-z]|\x1b_[^\x07]*\x07/g, '');

describe('runFeatureConsole', () => {
  let t: TFunction;
  let terminal: FakeTerminal;
  let loadSnapshot: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['loadSnapshot']>>;
  let runAction: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['runAction']>>;
  let loadLogTail: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['loadLogTail']>>;
  let openPane: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['openPane']>>;
  let runInline: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['runInline']>>;
  let notify: ReturnType<typeof vi.fn<(message: string) => void>> | undefined;
  let done: Promise<void> | undefined;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  beforeEach(() => {
    terminal = new FakeTerminal(120, 24);
    loadSnapshot = vi.fn<FeatureConsoleAppDeps['loadSnapshot']>(async () =>
      snapshotOf(gate('Billing UI'))
    );
    runAction = vi.fn<FeatureConsoleAppDeps['runAction']>(async () => ({
      ok: true,
      message: 'Approved and resumed',
    }));
    loadLogTail = vi.fn<FeatureConsoleAppDeps['loadLogTail']>(async () => ({
      logPath: '/logs/worker-run-1.log',
      lines: ['[text] hello'],
    }));
    openPane = vi.fn<FeatureConsoleAppDeps['openPane']>(async () => ({
      outcome: FeaturePaneOutcome.Opened,
      multiplexer: TerminalMultiplexer.Tmux,
      message: 'Opened a shell for Billing UI in tmux',
    }));
    runInline = vi.fn<FeatureConsoleAppDeps['runInline']>(async () => undefined);
    notify = vi.fn<(message: string) => void>();
  });

  afterEach(async () => {
    if (done && terminal.started) {
      terminal.type('q');
      await done;
    }
    done = undefined;
  });

  const start = () => {
    done = runFeatureConsole({
      t,
      terminal,
      loadSnapshot,
      runAction,
      loadLogTail,
      openPane,
      runInline,
      notify,
      refreshIntervalMs: REFRESH_MS,
    });
    return done;
  };
  const screenText = () => plain(terminal.output);

  it('starts the terminal and draws the first snapshot', async () => {
    void start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
    expect(terminal.calls[0]).toBe('start');
    expect(screenText()).toContain('NEEDS YOU');
  });

  it('polls on an interval, never starting a read while one is in flight', async () => {
    let release: (() => void) | undefined;
    loadSnapshot.mockImplementation(
      () =>
        new Promise<FeatureConsoleSnapshot>((resolve) => {
          release = () => resolve(snapshotOf(gate('Billing UI')));
        })
    );
    void start();
    await new Promise((r) => setTimeout(r, REFRESH_MS * 4));
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    release?.();
    await vi.waitFor(() => expect(loadSnapshot.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows a failed refresh and keeps the last rows', async () => {
    void start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
    loadSnapshot.mockRejectedValue(new Error('database is locked'));
    await vi.waitFor(() => expect(screenText()).toContain('Refresh failed: database is locked'));
  });

  it('runs an action, shows its result, then refreshes', async () => {
    void start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
    const readsBefore = loadSnapshot.mock.calls.length;

    terminal.type('a');

    await vi.waitFor(() => expect(screenText()).toContain('Approved and resumed'));
    expect(runAction).toHaveBeenCalledWith(
      'Billing UI-id',
      FeatureConsoleAction.Approve,
      undefined
    );
    expect(loadSnapshot.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('loads the log when the log pane opens and keeps it fresh', async () => {
    void start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

    terminal.type('l');

    await vi.waitFor(() => expect(screenText()).toContain('[text] hello'));
    expect(loadLogTail).toHaveBeenCalledWith('Billing UI-id', expect.any(Number));
    loadLogTail.mockResolvedValue({ logPath: '/logs/worker-run-1.log', lines: ['[text] later'] });
    await vi.waitFor(() => expect(screenText()).toContain('[text] later'));
  });

  describe('terminal panes (spec 143)', () => {
    it('opens a pane for the selected feature and shows the result', async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

      terminal.type('t');

      await vi.waitFor(() =>
        expect(screenText()).toContain('Opened a shell for Billing UI in tmux')
      );
      expect(openPane).toHaveBeenCalledWith(
        'Billing UI-id',
        FeaturePaneContent.Shell,
        FeaturePanePlacement.Split
      );
      expect(runInline).not.toHaveBeenCalled();
    });

    it('shows a refusal as an error', async () => {
      openPane.mockResolvedValue({
        outcome: FeaturePaneOutcome.Failed,
        message: 'kitten: remote control is disabled',
      });
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

      terminal.type('F');

      await vi.waitFor(() =>
        expect(screenText()).toContain('✗ kitten: remote control is disabled')
      );
      expect(openPane).toHaveBeenCalledWith(
        'Billing UI-id',
        FeaturePaneContent.Log,
        FeaturePanePlacement.Window
      );
    });

    it('without a multiplexer, steps aside for the command and comes back', async () => {
      openPane.mockResolvedValue({
        outcome: FeaturePaneOutcome.Inline,
        cwd: '/wt/billing',
        command: ['/bin/zsh'],
        message: 'No terminal multiplexer: running a shell for Billing UI here',
      });
      let release: (() => void) | undefined;
      runInline.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

      terminal.type('t');

      await vi.waitFor(() => expect(runInline).toHaveBeenCalled());
      expect(runInline).toHaveBeenCalledWith({
        cwd: '/wt/billing',
        command: ['/bin/zsh'],
        banner: 'Shell in /wt/billing. Type exit to return to shep tui.',
      });
      expect(terminal.started).toBe(false);
      // Polling goes on while the shell runs, but draws nothing over it.
      const written = terminal.output.length;
      await new Promise((r) => setTimeout(r, REFRESH_MS * 3));
      expect(terminal.output.length).toBe(written);

      release?.();
      await vi.waitFor(() => expect(terminal.started).toBe(true));
      await vi.waitFor(() => expect(terminal.output.length).toBeGreaterThan(written));
    });
  });

  describe('needs-you notifications (spec 143)', () => {
    it('alerts once when a feature starts needing the user, never for the first snapshot', async () => {
      const running = { ...gate('Dark mode'), state: FeatureState.Running, needsAttention: false };
      loadSnapshot.mockResolvedValue(snapshotOf(gate('Billing UI'), running));
      void start();
      await vi.waitFor(() => expect(loadSnapshot.mock.calls.length).toBeGreaterThan(1));
      expect(notify).not.toHaveBeenCalled();

      loadSnapshot.mockResolvedValue(snapshotOf(gate('Billing UI'), gate('Dark mode')));
      await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('Dark mode needs you'));
      const calls = notify!.mock.calls.length;
      await new Promise((r) => setTimeout(r, REFRESH_MS * 3));
      expect(notify!.mock.calls.length).toBe(calls);
    });

    it('counts features needing the user in the terminal title', async () => {
      void start();
      await vi.waitFor(() => expect(terminal.calls).toContain('setTitle:shep · needs you: 1'));
      loadSnapshot.mockResolvedValue(snapshotOf());
      await vi.waitFor(() => expect(terminal.calls).toContain('setTitle:shep tui'));
    });

    it('stays quiet when notifications are off', async () => {
      notify = undefined;
      loadSnapshot.mockResolvedValue(snapshotOf());
      void start();
      await vi.waitFor(() => expect(loadSnapshot.mock.calls.length).toBeGreaterThan(1));
      loadSnapshot.mockResolvedValue(snapshotOf(gate('Billing UI')));
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
    });
  });

  it('quits on q: stops polling and stops the terminal', async () => {
    const finished = start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

    terminal.type('q');
    await finished;

    expect(terminal.calls).toContain('stop');
    const reads = loadSnapshot.mock.calls.length;
    await new Promise((r) => setTimeout(r, REFRESH_MS * 3));
    expect(loadSnapshot.mock.calls.length).toBe(reads);
  });
});
