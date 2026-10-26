/**
 * runFeatureConsole Unit Tests (specs 142, 143, 145, 146, 147)
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
  FeatureChatEntryKind,
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  TerminalMultiplexer,
  FeatureState,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import { AgentActivityState } from '@/domain/generated/output.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import { FakeTerminal } from '@tests/helpers/tui/fake-terminal.js';
import { GATE_ROW, consoleRow, consoleSummary } from '@tests/helpers/feature-console-fixtures.js';

const REFRESH_MS = 25;

function gate(name: string): FeatureConsoleRow {
  return consoleRow({
    ...GATE_ROW,
    featureId: `${name}-id`,
    shortId: name.slice(0, 8),
    name,
    repositoryPath: '/acme',
    branch: `feat/${name}`,
    lifecycle: SdlcLifecycle.Requirements,
    phase: 'requirements',
    updatedAt: new Date(),
  });
}

const snapshotOf = (...rows: FeatureConsoleRow[]): FeatureConsoleSnapshot => ({
  generatedAt: new Date(),
  rows,
  summary: consoleSummary({
    total: rows.length,
    needsAttention: rows.length,
    activity: rows.length > 0 ? AgentActivityState.Blocked : AgentActivityState.Done,
  }),
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
  let openControlCenter: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['openControlCenter']>>;
  let updateMultiplexer: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['updateMultiplexer']>>;
  let loadChat: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['loadChat']>>;
  let sendChatMessage: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['sendChatMessage']>>;
  let answerChatQuestion: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['answerChatQuestion']>>;
  let stopChats: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['stopChats']>>;
  let reportActivity: ReturnType<
    typeof vi.fn<NonNullable<FeatureConsoleAppDeps['reportActivity']>>
  >;
  let releaseActivity: ReturnType<
    typeof vi.fn<NonNullable<FeatureConsoleAppDeps['releaseActivity']>>
  >;
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
    openControlCenter = vi.fn<FeatureConsoleAppDeps['openControlCenter']>(async (features) => ({
      outcome: FeaturePaneOutcome.Opened,
      multiplexer: TerminalMultiplexer.Tmux,
      windows: features.map((f, i) => ({ featureId: f.featureId, windowId: `@${i + 1}` })),
      message: `Opened ${features.length} windows in tmux`,
    }));
    updateMultiplexer = vi.fn<FeatureConsoleAppDeps['updateMultiplexer']>(async () => ({
      goneWindowIds: [],
    }));
    loadChat = vi.fn<FeatureConsoleAppDeps['loadChat']>(async (featureId) => ({
      featureId,
      name: 'Billing UI',
      directory: '/wt/billing',
      available: true,
      busy: false,
      entries: [
        {
          id: '1',
          kind: FeatureChatEntryKind.Assistant,
          text: 'Hello from the agent',
          createdAt: new Date(),
        },
      ],
      questions: [],
    }));
    sendChatMessage = vi.fn<FeatureConsoleAppDeps['sendChatMessage']>(async () => ({
      ok: true,
      message: 'Sent',
    }));
    answerChatQuestion = vi.fn<FeatureConsoleAppDeps['answerChatQuestion']>(async () => ({
      ok: true,
      message: 'Answered',
    }));
    stopChats = vi.fn<FeatureConsoleAppDeps['stopChats']>(async () => undefined);
    reportActivity = vi.fn<NonNullable<FeatureConsoleAppDeps['reportActivity']>>();
    releaseActivity = vi.fn<NonNullable<FeatureConsoleAppDeps['releaseActivity']>>(
      async () => undefined
    );
  });

  afterEach(async () => {
    if (done && terminal.started) {
      // ctrl+c quits from every mode (q is text in a prompt or the chat).
      terminal.type('\x03');
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
      openControlCenter,
      updateMultiplexer,
      loadChat,
      sendChatMessage,
      answerChatQuestion,
      stopChats,
      reportActivity,
      releaseActivity,
      refreshIntervalMs: REFRESH_MS,
      chatRefreshIntervalMs: REFRESH_MS,
    });
    return done;
  };
  const screenText = () => plain(terminal.output);

  describe('terminal host activity (spec 148)', () => {
    it('tells the host what shep is doing and how many features need the user', async () => {
      void start();
      await vi.waitFor(() =>
        expect(reportActivity).toHaveBeenCalledWith({
          state: AgentActivityState.Blocked,
          message: t('tui:console.hostStatus.blocked', { count: 1 }),
        })
      );
    });

    it('sends no message when nothing needs the user', async () => {
      loadSnapshot.mockResolvedValue(snapshotOf());
      void start();
      await vi.waitFor(() =>
        expect(reportActivity).toHaveBeenCalledWith({ state: AgentActivityState.Done })
      );
    });

    it('lets go of the host when the console quits', async () => {
      void start();
      await vi.waitFor(() => expect(reportActivity).toHaveBeenCalled());
      terminal.type('\x03');
      await done;
      expect(releaseActivity).toHaveBeenCalledTimes(1);
    });

    it('keeps working when the host cannot be told', async () => {
      reportActivity.mockImplementation(() => {
        throw new Error('herdr is gone');
      });
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      expect(screenText()).not.toContain('herdr is gone');
    });
  });

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

  it('copies the selected feature id to the clipboard over OSC 52 (spec 145)', async () => {
    void start();
    await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

    terminal.type('c');

    await vi.waitFor(() =>
      expect(screenText()).toContain('Copied the id of Billing UI: Billing UI-id')
    );
    expect(terminal.output).toContain(
      `\x1b]52;c;${Buffer.from('Billing UI-id').toString('base64')}\x07`
    );
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

  describe('control center and tmux status (spec 146)', () => {
    it('opens a window per active feature with C, named with its state', async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

      terminal.type('C');

      await vi.waitFor(() => expect(screenText()).toContain('Opened 1 windows in tmux'));
      expect(openControlCenter).toHaveBeenCalledWith([
        { featureId: 'Billing UI-id', title: '◆ Billing UI' },
      ]);
    });

    it('opens no second window for the same feature', async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('C');
      await vi.waitFor(() => expect(openControlCenter).toHaveBeenCalledTimes(1));

      terminal.type('C');

      await vi.waitFor(() =>
        expect(screenText()).toContain('Every active feature already has a window')
      );
      expect(openControlCenter).toHaveBeenCalledTimes(1);
    });

    it("renames a feature's window when its state changes", async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('C');
      await vi.waitFor(() => expect(openControlCenter).toHaveBeenCalled());

      loadSnapshot.mockResolvedValue(
        snapshotOf({ ...gate('Billing UI'), state: FeatureState.Running, needsAttention: false })
      );

      await vi.waitFor(() =>
        expect(updateMultiplexer).toHaveBeenCalledWith(
          expect.objectContaining({ renames: [{ windowId: '@1', title: '● Billing UI' }] })
        )
      );
    });

    it('publishes the status segment when it changes, and only then', async () => {
      void start();
      await vi.waitFor(() =>
        expect(updateMultiplexer).toHaveBeenCalledWith({
          renames: [],
          status: {
            '@shep_status': '#[fg=yellow,bold]◆ 1 needs you#[default]',
            '@shep_needs_you': '1',
          },
        })
      );
      await new Promise((r) => setTimeout(r, REFRESH_MS * 4));
      expect(updateMultiplexer).toHaveBeenCalledTimes(1);

      loadSnapshot.mockResolvedValue(snapshotOf());
      await vi.waitFor(() =>
        expect(updateMultiplexer).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: expect.objectContaining({ '@shep_needs_you': '0' }) })
        )
      );
    });
  });

  describe('chat (spec 147)', () => {
    it('attaches with o and keeps the transcript fresh until esc', async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));

      terminal.type('o');

      await vi.waitFor(() => expect(screenText()).toContain('Hello from the agent'));
      expect(loadChat).toHaveBeenCalledWith('Billing UI-id', expect.any(Number));
      await vi.waitFor(() => expect(loadChat.mock.calls.length).toBeGreaterThan(2));

      terminal.type('\x1b');
      await new Promise((r) => setTimeout(r, REFRESH_MS * 2));
      const calls = loadChat.mock.calls.length;
      await new Promise((r) => setTimeout(r, REFRESH_MS * 4));
      expect(loadChat.mock.calls.length).toBe(calls);
    });

    it('sends a message, shows a failure, and answers a question', async () => {
      void start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('o');
      await vi.waitFor(() => expect(screenText()).toContain('Hello from the agent'));

      terminal.type('h', 'i', '\r');
      await vi.waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('Billing UI-id', 'hi'));

      sendChatMessage.mockResolvedValue({ ok: false, message: 'No interactive mode' });
      terminal.type('x', '\r');
      await vi.waitFor(() => expect(screenText()).toContain('No interactive mode'));

      loadChat.mockResolvedValue({
        featureId: 'Billing UI-id',
        name: 'Billing UI',
        directory: '/wt',
        available: true,
        busy: false,
        entries: [],
        questions: [
          { header: 'Q', question: 'Which?', options: [{ label: 'A' }], multiSelect: false },
        ],
      });
      await vi.waitFor(() => expect(screenText()).toContain('Which?'));
      terminal.type('1');
      await vi.waitFor(() =>
        expect(answerChatQuestion).toHaveBeenCalledWith('Billing UI-id', { 'Which?': 'A' })
      );
    });

    it('stops the chat sessions it started when it quits', async () => {
      const finished = start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('o');
      await vi.waitFor(() => expect(screenText()).toContain('Hello from the agent'));
      terminal.type('h', 'i', '\r');
      await vi.waitFor(() => expect(sendChatMessage).toHaveBeenCalled());

      terminal.type('\x03');
      await finished;

      expect(stopChats).toHaveBeenCalledWith(['Billing UI-id']);
    });

    it('stops nothing when no chat was used', async () => {
      const finished = start();
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('q');
      await finished;
      expect(stopChats).not.toHaveBeenCalled();
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
