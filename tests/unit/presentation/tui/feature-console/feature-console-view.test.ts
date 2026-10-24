/**
 * FeatureConsoleView Unit Tests (specs 142, 143, 145)
 *
 * The view is a pi-tui Component: render(width) must return exactly one screen
 * of lines (the console runs on the alternate screen), never wider than the
 * terminal, and key input turns into intents the app carries out. It makes no
 * business decisions — which keys a row offers comes from the snapshot.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Render with colours, as a real terminal would: picocolors decides at import.
vi.hoisted(() => {
  process.env.FORCE_COLOR = '1';
});
import type { TFunction } from 'i18next';
import { visibleWidth } from '@mariozechner/pi-tui';

import { initI18n } from '@/presentation/tui/i18n.js';
import {
  FeatureConsoleView,
  type FeatureConsoleIntents,
} from '@/presentation/tui/feature-console/feature-console-view.js';
import {
  AgentRunStatus,
  AgentType,
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePanePlacement,
  FeatureState,
  PrStatus,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';

const ESC = '\x1b';
const KEY = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  enter: '\r',
  escape: ESC,
  ctrlC: '\x03',
  ctrlP: '\x10',
} as const;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b_[^\x07]*\x07|\x1b\][^\x07]*\x07/g;
const plain = (lines: string[]) => lines.map((l) => l.replace(ANSI, ''));

function row(id: string, overrides: Partial<FeatureConsoleRow> = {}): FeatureConsoleRow {
  return {
    featureId: `${id}-0000-0000`,
    shortId: id,
    name: `Feature ${id}`,
    repositoryName: 'acme-web',
    repositoryPath: '/work/acme-web',
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Implementation,
    state: FeatureState.Running,
    phase: 'implement',
    agentType: AgentType.ClaudeCode,
    modelId: 'claude-opus-5-5',
    runId: `run-${id}`,
    runStatus: AgentRunStatus.running,
    elapsedMs: 12 * 60_000,
    costUsd: 0.42,
    inputTokens: 12_000,
    outputTokens: 3_400,
    pendingQuestions: 0,
    needsAttention: false,
    actions: [FeatureConsoleAction.Stop],
    updatedAt: new Date('2026-10-24T12:00:00Z'),
    ...overrides,
  };
}

const gateRow = (id: string) =>
  row(id, {
    state: FeatureState.ActionRequired,
    phase: 'requirements',
    runStatus: AgentRunStatus.waitingApproval,
    needsAttention: true,
    actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
  });

function snapshot(rows: FeatureConsoleRow[]): FeatureConsoleSnapshot {
  return {
    generatedAt: new Date('2026-10-24T12:00:00Z'),
    rows,
    summary: {
      total: rows.length,
      needsAttention: rows.filter((r) => r.needsAttention).length,
      running: rows.filter((r) => r.state === FeatureState.Running).length,
      waiting: 0,
      failed: rows.filter((r) => r.state === FeatureState.Error).length,
      done: rows.filter((r) => r.state === FeatureState.Done).length,
    },
  };
}

describe('FeatureConsoleView', () => {
  let t: TFunction;
  let height: number;
  let intents: { [K in keyof FeatureConsoleIntents]: ReturnType<typeof vi.fn> };
  let view: FeatureConsoleView;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  beforeEach(() => {
    height = 24;
    intents = {
      runAction: vi.fn(),
      showLog: vi.fn(),
      openPane: vi.fn(),
      copyId: vi.fn(),
      quit: vi.fn(),
      requestRender: vi.fn(),
    };
    view = new FeatureConsoleView({
      t,
      rows: () => height,
      intents: intents as unknown as FeatureConsoleIntents,
    });
  });

  const screen = (width = 120) => plain(view.render(width));
  const press = (...keys: string[]) => keys.forEach((k) => view.handleInput(k));

  describe('frame', () => {
    it.each([60, 90, 120, 200])(
      'renders exactly one screen, never wider than %i columns',
      (width) => {
        view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222'), row('cccc3333')]));
        const lines = view.render(width);
        expect(lines).toHaveLength(height);
        for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    );

    it('follows the terminal height', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      height = 40;
      expect(view.render(100)).toHaveLength(40);
      height = 12;
      expect(view.render(100)).toHaveLength(12);
    });

    it('shows the summary in the header', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222')]));
      const header = screen()[0];
      expect(header).toContain('Features');
      expect(header).toMatch(/1 needs you/);
      expect(header).toMatch(/1 running/);
    });

    it('explains how to start when there are no features', () => {
      view.setSnapshot(snapshot([]));
      const text = screen().join('\n');
      expect(text).toContain('No features yet');
      expect(text).toContain('shep feat new');
    });
  });

  describe('needs-you strip', () => {
    it('lists features waiting at a gate or with open questions', () => {
      view.setSnapshot(
        snapshot([
          gateRow('aaaa1111'),
          row('bbbb2222', { pendingQuestions: 2, needsAttention: true }),
          row('cccc3333'),
        ])
      );
      const strip = screen()[1];
      expect(strip).toContain('NEEDS YOU');
      expect(strip).toContain('Feature aaaa1111');
      expect(strip).toContain('review requirements');
      expect(strip).toContain('Feature bbbb2222');
      expect(strip).toContain('questions: 2');
      expect(strip).not.toContain('Feature cccc3333');
    });

    it('says so when nothing needs the user', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      expect(screen()[1]).toContain('Nothing needs you right now');
    });
  });

  describe('roster', () => {
    it('shows rows in snapshot order with state, phase, time and cost', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222')]));
      const text = screen(160);
      const first = text.findIndex(
        (l) => l.includes('Feature aaaa1111') && l.includes('Needs you')
      );
      const second = text.findIndex((l) => l.includes('Feature bbbb2222') && l.includes('Running'));
      expect(first).toBeGreaterThan(1);
      expect(second).toBeGreaterThan(first);
      expect(text[second]).toContain('implement');
      expect(text[second]).toContain('12m');
      expect(text[second]).toContain('$0.42');
    });

    it('moves the selection with the arrow keys and j/k', () => {
      view.setSnapshot(snapshot([row('aaaa1111'), row('bbbb2222'), row('cccc3333')]));
      expect(view.selectedRow?.shortId).toBe('aaaa1111');
      press(KEY.down);
      expect(view.selectedRow?.shortId).toBe('bbbb2222');
      press('j');
      expect(view.selectedRow?.shortId).toBe('cccc3333');
      press('j');
      expect(view.selectedRow?.shortId).toBe('cccc3333');
      press(KEY.up, 'k');
      expect(view.selectedRow?.shortId).toBe('aaaa1111');
      press('G');
      expect(view.selectedRow?.shortId).toBe('cccc3333');
      press('g');
      expect(view.selectedRow?.shortId).toBe('aaaa1111');
    });

    it('highlights the whole selected row, even after a truncated name', () => {
      view.setSnapshot(
        snapshot([row('aaaa1111', { name: 'A feature name far too long to fit its column' })])
      );
      const line = view.render(160).find((l) => l.includes('▸'))!;
      // Every visible cell after the marker must sit inside an inverse (7)
      // span: a full reset (0) from truncation must not end the highlight.
      // The roster part of the line: from the marker to the pane divider.
      const rosterPart = line.slice(line.indexOf('▸') + 1, line.indexOf('│'));
      // eslint-disable-next-line no-control-regex
      const segments = rosterPart.split(/(\x1b\[[0-9;]*m)/);
      let inverse = false;
      for (const segment of segments) {
        // eslint-disable-next-line no-control-regex
        const sgr = segment.match(/^\x1b\[([0-9;]*)m$/);
        if (sgr) {
          const codes = sgr[1].split(';');
          if (codes.includes('7')) inverse = true;
          if (codes.includes('27') || codes.includes('0') || sgr[1] === '') inverse = false;
          continue;
        }
        if (segment.trim()) expect(inverse, `"${segment}" is outside the highlight`).toBe(true);
      }
    });

    it('keeps the same feature selected when a refresh reorders the rows', () => {
      view.setSnapshot(snapshot([row('aaaa1111'), row('bbbb2222')]));
      press('j');
      view.setSnapshot(snapshot([gateRow('cccc3333'), row('aaaa1111'), row('bbbb2222')]));
      expect(view.selectedRow?.shortId).toBe('bbbb2222');
    });

    it('keeps the selected row on screen when the list is longer than the screen', () => {
      height = 12;
      const many = Array.from({ length: 30 }, (_, i) => row(`id${String(i).padStart(6, '0')}`));
      view.setSnapshot(snapshot(many));
      press('G');
      expect(screen(80).join('\n')).toContain('Feature id000029');
    });
  });

  describe('details and log panes', () => {
    it('shows the selected feature details', () => {
      view.setSnapshot(
        snapshot([
          row('aaaa1111', {
            pr: { number: 7, url: 'https://github.com/acme/web/pull/7', status: PrStatus.Open },
            error: 'npm test failed',
            state: FeatureState.Error,
          }),
        ])
      );
      const text = screen(160).join('\n');
      expect(text).toContain('feat/aaaa1111');
      expect(text).toContain('#7');
      expect(text).toContain('npm test failed');
      expect(text).toContain('claude-opus-5-5');
    });

    it('asks for the log with l and shows it without control characters', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('l');
      expect(intents.showLog).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' })
      );

      view.setLog({
        logPath: '/x/worker-run.log',
        lines: ['[text] planning the change', `${ESC}[31m[tool] Read src/app.ts${ESC}[0m\x07`],
      });
      const text = screen(160).join('\n');
      expect(text).toContain('[text] planning the change');
      expect(text).toContain('[tool] Read src/app.ts');
      expect(view.render(160).join('\n')).not.toContain('\x07');

      press('i');
      expect(screen(160).join('\n')).not.toContain('[text] planning the change');
    });

    it('wraps long log lines so the end of each line stays readable', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('l');
      view.setLog({
        lines: [
          '[2026-10-24T09:43:07.744Z] [claude-code|claude-opus-5-5] [WORKER] Spawned the merge step with the final summary',
        ],
      });
      const text = screen(160).join('\n');
      expect(text).toContain('final summary');
    });

    it('asks for the new feature log when the selection moves while the log is open', () => {
      view.setSnapshot(snapshot([row('aaaa1111'), row('bbbb2222')]));
      press('l', 'j');
      expect(intents.showLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ shortId: 'bbbb2222' })
      );
    });
  });

  describe('actions', () => {
    it('approves with a when the row offers it, and only then', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222')]));
      press('a');
      expect(intents.runAction).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeatureConsoleAction.Approve,
        undefined
      );

      intents.runAction.mockClear();
      press('j', 'a');
      expect(intents.runAction).not.toHaveBeenCalled();
    });

    it('shows only the offered action keys in the key bar', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222')]));
      const gateBar = screen().at(-1)!;
      expect(gateBar).toContain('approve');
      expect(gateBar).toContain('reject');
      expect(gateBar).not.toContain('stop');

      press('j');
      const runningBar = screen().at(-1)!;
      expect(runningBar).toContain('stop');
      expect(runningBar).not.toContain('approve');
    });

    it('rejects with typed feedback after r, and cancels with esc', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press('r');
      expect(screen().join('\n')).toContain('Feedback for Feature aaaa1111:');

      press(...'split the API change out');
      press(KEY.enter);
      expect(intents.runAction).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeatureConsoleAction.Reject,
        'split the API change out'
      );
      expect(screen().join('\n')).not.toContain('Feedback for');

      intents.runAction.mockClear();
      press('r', 'x', KEY.escape);
      expect(intents.runAction).not.toHaveBeenCalled();
      expect(screen().join('\n')).not.toContain('Feedback for');
    });

    it('does not send an empty rejection', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press('r', KEY.enter);
      expect(intents.runAction).not.toHaveBeenCalled();
    });

    it('asks before stopping, and stops only on y', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('s');
      expect(screen().join('\n')).toContain('Stop Feature aaaa1111?');
      press('n');
      expect(intents.runAction).not.toHaveBeenCalled();

      press('s', 'y');
      expect(intents.runAction).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeatureConsoleAction.Stop,
        undefined
      );
    });

    it('resumes with R', () => {
      view.setSnapshot(
        snapshot([
          row('aaaa1111', {
            state: FeatureState.Error,
            runStatus: AgentRunStatus.interrupted,
            actions: [FeatureConsoleAction.Resume],
          }),
        ])
      );
      press('R');
      expect(intents.runAction).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeatureConsoleAction.Resume,
        undefined
      );
    });

    it('ignores action keys while an action is in flight, and shows progress', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      view.setBusy('Approving Feature aaaa1111…');
      press('a');
      expect(intents.runAction).not.toHaveBeenCalled();
      expect(screen().join('\n')).toContain('Approving Feature aaaa1111…');
    });

    it('shows the result of the last action on the status line', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      view.setStatus({ ok: false, message: 'Gate already decided' });
      expect(screen().at(-2)).toContain('Gate already decided');
    });

    it('clears an action result once the selection moves to another feature', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111'), row('bbbb2222')]));
      view.setStatus({ ok: true, message: 'Approved and resumed' });
      press('j');
      expect(screen().join('\n')).not.toContain('Approved and resumed');
    });

    it('shows a refresh failure without losing the last snapshot', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      view.setRefreshError('database is locked');
      const text = screen().join('\n');
      expect(text).toContain('Refresh failed: database is locked');
      expect(text).toContain('Feature aaaa1111');
    });
  });

  describe('terminal panes (spec 143)', () => {
    it.each([
      ['t', FeaturePaneContent.Shell, FeaturePanePlacement.Split],
      ['T', FeaturePaneContent.Shell, FeaturePanePlacement.Window],
      ['f', FeaturePaneContent.Log, FeaturePanePlacement.Split],
      ['F', FeaturePaneContent.Log, FeaturePanePlacement.Window],
    ])('%s opens a %s pane (%s) for the selected feature', (key, content, placement) => {
      view.setSnapshot(snapshot([row('aaaa1111'), row('bbbb2222')]));
      press('j', key);
      expect(intents.openPane).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'bbbb2222' }),
        content,
        placement
      );
    });

    it('follows a log only for a feature that has a run', () => {
      view.setSnapshot(snapshot([row('aaaa1111', { runId: undefined })]));
      press('f', 'F');
      expect(intents.openPane).not.toHaveBeenCalled();
      press('t');
      expect(intents.openPane).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a selected feature', () => {
      view.setSnapshot(snapshot([]));
      press('t', 'f');
      expect(intents.openPane).not.toHaveBeenCalled();
    });

    it('offers the pane keys in the key bar', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      const keyBar = screen(200).at(-1) ?? '';
      expect(keyBar).toContain('t shell');
      expect(keyBar).toContain('f follow log');
      expect(keyBar).toContain('/ filter');
    });

    it('lists the pane keys and the filter in help', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('?');
      const text = screen().join('\n');
      expect(text).toContain('shell in the worktree');
      expect(text).toContain('follow the agent log');
      expect(text).toContain('filter the features');
    });
  });

  describe('filter (spec 143)', () => {
    const rows = () => [
      gateRow('aaaa1111'),
      row('bbbb2222', { name: 'Billing charts' }),
      row('cccc3333', { name: 'Dark mode' }),
    ];
    // At 160 columns the details pane sits on the right: read the roster column only.
    const rosterColumn = () =>
      screen(160)
        .slice(2, -2)
        .map((l) => l.slice(0, 96));
    const rosterNames = () =>
      rosterColumn().filter((l) => /Feature aaaa1111|Billing charts|Dark mode/.test(l));

    it('narrows the roster as the user types, without touching the strip', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'b', 'i', 'l', 'l');
      const text = screen(160);
      expect(rosterNames().some((l) => l.includes('Billing charts'))).toBe(true);
      expect(rosterNames().some((l) => l.includes('Dark mode'))).toBe(false);
      expect(text[1]).toContain('Feature aaaa1111');
      expect(text.at(-2)).toContain('bill');
    });

    it('types letters into the filter instead of running their keys', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'q', 'a', 't');
      expect(intents.quit).not.toHaveBeenCalled();
      expect(intents.runAction).not.toHaveBeenCalled();
      expect(intents.openPane).not.toHaveBeenCalled();
    });

    it('keeps the filter on enter, and selects within it', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'd', 'a', 'r', 'k', KEY.enter);
      expect(view.selectedRow?.name).toBe('Dark mode');
      press('t');
      expect(intents.openPane).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dark mode' }),
        FeaturePaneContent.Shell,
        FeaturePanePlacement.Split
      );
      expect(rosterNames()).toHaveLength(1);
      expect(screen(160).at(-2)).toContain('dark');
    });

    it('clears the filter with esc and keeps the selection', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'd', 'a', 'r', 'k', KEY.enter);
      press('/', KEY.escape);
      expect(rosterNames()).toHaveLength(3);
      expect(view.selectedRow?.name).toBe('Dark mode');
    });

    it('says when nothing matches', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'z', 'z', 'z');
      expect(screen().join('\n')).toContain('No feature matches');
      expect(view.selectedRow).toBeUndefined();
    });

    it('applies the filter to rows from later refreshes', () => {
      view.setSnapshot(snapshot(rows()));
      press('/', 'd', 'a', 'r', 'k', KEY.enter);
      view.setSnapshot(snapshot([...rows(), row('dddd4444', { name: 'Dark charts' })]));
      const shown = rosterColumn().filter((l) => /Dark mode|Dark charts|Billing/.test(l));
      expect(shown).toHaveLength(2);
      expect(shown.some((l) => l.includes('Dark charts'))).toBe(true);
    });

    it('still quits on ctrl+c while filtering', () => {
      press('/', KEY.ctrlC);
      expect(intents.quit).toHaveBeenCalledTimes(1);
    });
  });

  describe('command palette (spec 145)', () => {
    it('opens with ctrl+p or :, listing the commands the feature allows with their keys', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      for (const key of [KEY.ctrlP, ':']) {
        press(key);
        const text = screen().join('\n');
        expect(text).toContain('Commands');
        expect(text).toContain('Approve the gate');
        expect(text).not.toContain('Stop the run');
        press(KEY.escape);
        expect(screen().join('\n')).not.toContain('Approve the gate');
      }
    });

    it('runs the chosen command exactly as its key would', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press(':', 'a', 'p', 'p', 'r', KEY.enter);
      expect(intents.runAction).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeatureConsoleAction.Approve,
        undefined
      );

      press(':', 's', 'h', 'e', 'l', 'l', KEY.enter);
      expect(intents.openPane).toHaveBeenCalledWith(
        expect.objectContaining({ shortId: 'aaaa1111' }),
        FeaturePaneContent.Shell,
        FeaturePanePlacement.Split
      );
    });

    it('opens the reject prompt from the palette like r does', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press(':', 'r', 'e', 'j', 'e', 'c', 't', KEY.enter);
      expect(screen().at(-2)).toContain('Feedback for Feature aaaa1111');
    });

    it('treats letters as the query, and ctrl+c still quits', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press(':', 'q');
      expect(intents.quit).not.toHaveBeenCalled();
      press(KEY.ctrlC);
      expect(intents.quit).toHaveBeenCalledTimes(1);
    });

    it('clears an active filter from the palette', () => {
      view.setSnapshot(snapshot([row('aaaa1111', { name: 'Dark mode' }), row('bbbb2222')]));
      press('/', 'd', 'a', 'r', 'k', KEY.enter);
      expect(screen().at(-2)).toContain('1 of 2');
      press(':', 'c', 'l', 'e', 'a', 'r', KEY.enter);
      expect(screen().at(-2)).not.toContain('1 of 2');
    });

    it('copies the selected feature id with c', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('c');
      expect(intents.copyId).toHaveBeenCalledWith(expect.objectContaining({ shortId: 'aaaa1111' }));
    });

    it('lists the palette in the key bar and in help', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      expect(screen(220).at(-1)).toContain('ctrl+p palette');
      press('?');
      expect(screen().join('\n')).toContain('command palette');
    });
  });

  describe('help and quit', () => {
    it('opens help with ? and closes it with esc', () => {
      view.setSnapshot(snapshot([row('aaaa1111')]));
      press('?');
      expect(screen().join('\n')).toContain('reject the gate with feedback');
      press(KEY.escape);
      expect(screen().join('\n')).not.toContain('reject the gate with feedback');
      expect(intents.quit).not.toHaveBeenCalled();
    });

    it('quits with q and with ctrl+c', () => {
      press('q');
      press(KEY.ctrlC);
      expect(intents.quit).toHaveBeenCalledTimes(2);
    });

    it('types q into the reject feedback, but still quits on ctrl+c', () => {
      view.setSnapshot(snapshot([gateRow('aaaa1111')]));
      press('r', 'q');
      expect(intents.quit).not.toHaveBeenCalled();
      expect(screen().join('\n')).toContain('q');
      press(KEY.ctrlC);
      expect(intents.quit).toHaveBeenCalledTimes(1);
    });
  });
});
