/**
 * Self-learning harness in the feature console (spec 150, tasks 23 and 28)
 *
 * `d` lists the learned-harness changes waiting for the user and answers them
 * through the inbox; `N` creates a feature in the selected feature's
 * repository, offering Explore only while the selfLearning flag is on.
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
import { harnessDecisionItems } from '@/presentation/tui/feature-console/harness-decisions.js';
import {
  AgentActivityState,
  FeaturePaneOutcome,
  SdlcLifecycle,
  TerminalMultiplexer,
} from '@/domain/generated/output.js';
import type { FeatureConsoleSnapshot } from '@/application/use-cases/feature-console/feature-console.types.js';
import { FakeTerminal } from '@tests/helpers/tui/fake-terminal.js';
import { GATE_ROW, consoleRow, consoleSummary } from '@tests/helpers/feature-console-fixtures.js';
import { harnessQuestion } from '@tests/helpers/tui/harness-decision-fixtures.js';

const REFRESH_MS = 25;
const ESC = '\x1b';
const KEY = { up: `${ESC}[A`, tab: '\t', enter: '\r', escape: ESC, ctrlC: '\x03' } as const;

// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\x1b\[[0-9;?<>=]*[A-Za-z]|\x1b_[^\x07]*\x07/g, '');

const snapshot = (): FeatureConsoleSnapshot => ({
  generatedAt: new Date(),
  fleet: { circuitBreakerTripped: false },
  rows: [
    consoleRow({
      ...GATE_ROW,
      featureId: 'billing-id',
      shortId: 'billing',
      name: 'Billing UI',
      repositoryName: 'acme',
      repositoryPath: '/acme',
      branch: 'feat/billing',
      lifecycle: SdlcLifecycle.Requirements,
      phase: 'requirements',
      updatedAt: new Date(),
    }),
  ],
  summary: consoleSummary({ total: 1, needsAttention: 1, activity: AgentActivityState.Blocked }),
});

const ITEMS = harnessDecisionItems([harnessQuestion('v1')]);

describe('feature console — self-learning harness', () => {
  let t: TFunction;
  let terminal: FakeTerminal;
  let loadHarnessDecisions: ReturnType<
    typeof vi.fn<NonNullable<FeatureConsoleAppDeps['loadHarnessDecisions']>>
  >;
  let answerHarnessDecision: ReturnType<
    typeof vi.fn<NonNullable<FeatureConsoleAppDeps['answerHarnessDecision']>>
  >;
  let createFeature: ReturnType<typeof vi.fn<NonNullable<FeatureConsoleAppDeps['createFeature']>>>;
  let loadSnapshot: ReturnType<typeof vi.fn<FeatureConsoleAppDeps['loadSnapshot']>>;
  let done: Promise<void> | undefined;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  beforeEach(() => {
    terminal = new FakeTerminal(120, 30);
    loadSnapshot = vi.fn(async () => snapshot());
    loadHarnessDecisions = vi.fn(async () => ITEMS);
    answerHarnessDecision = vi.fn(async (_item, answer) => ({
      ok: true,
      message: answer.adopt ? 'Adopted the harness change' : 'Rejected the harness change',
    }));
    createFeature = vi.fn(async () => ({ ok: true, message: 'Created Dark mode' }));
  });

  afterEach(async () => {
    if (done && terminal.started) {
      terminal.type(KEY.ctrlC);
      await done;
    }
    done = undefined;
  });

  function start(overrides: Partial<FeatureConsoleAppDeps> = {}): void {
    done = runFeatureConsole({
      t,
      terminal,
      loadSnapshot,
      runAction: vi.fn(async () => ({ ok: true, message: '' })),
      loadLogTail: vi.fn(async () => ({ lines: [] })),
      openPane: vi.fn<FeatureConsoleAppDeps['openPane']>(async () => ({
        outcome: FeaturePaneOutcome.Opened,
        multiplexer: TerminalMultiplexer.Tmux,
        message: '',
      })),
      runInline: vi.fn(async () => undefined),
      openControlCenter: vi.fn<FeatureConsoleAppDeps['openControlCenter']>(async () => ({
        outcome: FeaturePaneOutcome.Opened,
        multiplexer: TerminalMultiplexer.Tmux,
        windows: [],
        message: '',
      })),
      updateMultiplexer: vi.fn(async () => ({ goneWindowIds: [] })),
      loadChat: vi.fn(),
      sendChatMessage: vi.fn(),
      answerChatQuestion: vi.fn(),
      stopChats: vi.fn(async () => undefined),
      releaseQueue: vi.fn(async () => ({ ok: true, message: '' })),
      loadHarnessDecisions,
      answerHarnessDecision,
      createFeature,
      refreshIntervalMs: REFRESH_MS,
      ...overrides,
    });
  }

  const screenText = () => plain(terminal.output);

  describe('harness decisions (task-23)', () => {
    it('reads the waiting decisions with every snapshot and offers d in the key bar', async () => {
      start();
      await vi.waitFor(() => expect(loadHarnessDecisions.mock.calls.length).toBeGreaterThan(1));
      await vi.waitFor(() => expect(screenText()).toContain('d harness changes (1)'));
    });

    it('d shows the decision with its diff summary; a adopts it through the inbox', async () => {
      start();
      await vi.waitFor(() => expect(screenText()).toContain('harness changes (1)'));
      terminal.type('d');
      await vi.waitFor(() => expect(screenText()).toContain('Learned harness changes'));
      expect(screenText()).toContain('Shep learned from "Billing UI"');
      expect(screenText()).toContain('+ skills/testing/SKILL.md');

      terminal.type('a');
      await vi.waitFor(() =>
        expect(answerHarnessDecision).toHaveBeenCalledWith(ITEMS[0], { adopt: true })
      );
      await vi.waitFor(() => expect(screenText()).toContain('Adopted the harness change'));
    });

    it('r rejects with the typed feedback', async () => {
      start();
      await vi.waitFor(() => expect(screenText()).toContain('harness changes (1)'));
      terminal.type('d', 'r', ...'Too broad', KEY.enter);

      await vi.waitFor(() =>
        expect(answerHarnessDecision).toHaveBeenCalledWith(ITEMS[0], {
          adopt: false,
          feedback: 'Too broad',
        })
      );
    });

    it('re-reads the decisions after answering, so an answered one leaves the list', async () => {
      start();
      await vi.waitFor(() => expect(screenText()).toContain('harness changes (1)'));
      terminal.type('d');
      loadHarnessDecisions.mockResolvedValue([]);
      terminal.type('a');

      await vi.waitFor(() =>
        expect(screenText()).toContain('No harness change is waiting for you')
      );
    });

    it('offers nothing when the console has no decision source', async () => {
      start({ loadHarnessDecisions: undefined, answerHarnessDecision: undefined });
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('d');
      await new Promise((r) => setTimeout(r, REFRESH_MS * 2));

      expect(screenText()).not.toContain('Learned harness changes');
    });
  });

  describe('create flow (task-28)', () => {
    it('N creates in the selected feature repository with Explore and k (flag on)', async () => {
      start({ explore: { defaultK: 1 } });
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('N');
      await vi.waitFor(() => expect(screenText()).toContain('New feature in acme'));
      expect(screenText()).toContain('Explore');

      terminal.type(KEY.tab, KEY.up, ...'Add dark mode', KEY.enter);

      await vi.waitFor(() =>
        expect(createFeature).toHaveBeenCalledWith({
          repositoryPath: '/acme',
          userInput: 'Add dark mode',
          exploreHarness: true,
          exploreK: 2,
        })
      );
      await vi.waitFor(() => expect(screenText()).toContain('Created Dark mode'));
    });

    it('has no Explore choice and passes none with the flag off', async () => {
      start({ explore: undefined });
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('N');
      await vi.waitFor(() => expect(screenText()).toContain('New feature in acme'));
      expect(screenText()).not.toContain('Explore');

      terminal.type(KEY.tab, ...'Add dark mode', KEY.enter);

      await vi.waitFor(() =>
        expect(createFeature).toHaveBeenCalledWith({
          repositoryPath: '/acme',
          userInput: 'Add dark mode',
        })
      );
    });

    it('N does nothing without a create use case', async () => {
      start({ createFeature: undefined });
      await vi.waitFor(() => expect(screenText()).toContain('Billing UI'));
      terminal.type('N');
      await new Promise((r) => setTimeout(r, REFRESH_MS * 2));

      expect(screenText()).not.toContain('New feature in');
    });
  });
});
