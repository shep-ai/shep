/**
 * HarnessDecisionsView Unit Tests (spec 150, task-23)
 *
 * The console's view of learned-harness candidates waiting for the user: each
 * one's summary and diff preview, `a` to adopt and `r` to reject with optional
 * feedback. The view decides nothing; adopting and rejecting are intents.
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
  HarnessDecisionsView,
  type HarnessDecisionsIntents,
} from '@/presentation/tui/feature-console/harness-decisions-view.js';
import { harnessDecisionItems } from '@/presentation/tui/feature-console/harness-decisions.js';
import { harnessQuestion } from '@tests/helpers/tui/harness-decision-fixtures.js';
import { buildHarnessChangeDecision } from '@/domain/harness-learning/harness-decision.js';

const ESC = '\x1b';
const KEY = { down: `${ESC}[B`, enter: '\r', escape: ESC, ctrlC: '\x03' } as const;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b_[^\x07]*\x07/g;
const plain = (lines: string[]) => lines.map((l) => l.replace(ANSI, '')).join('\n');

const items = harnessDecisionItems([
  harnessQuestion('v1'),
  harnessQuestion('v2', { prompt: 'Shep learned from "Search" and proposes a second change' }),
]);

describe('HarnessDecisionsView', () => {
  let t: TFunction;
  let intents: { [K in keyof HarnessDecisionsIntents]: ReturnType<typeof vi.fn> };
  let view: HarnessDecisionsView;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  beforeEach(() => {
    intents = { adopt: vi.fn(), reject: vi.fn(), close: vi.fn(), quit: vi.fn() };
    view = new HarnessDecisionsView(t, intents as unknown as HarnessDecisionsIntents);
    view.open();
    view.setItems(items);
  });

  const type = (text: string) => [...text].forEach((c) => view.handleInput(c));

  it('renders the selected decision with its summary and diff preview', () => {
    const screen = plain(view.render(100, 20));

    expect(screen).toContain('Learned harness changes');
    expect(screen).toContain('waiting: 2');
    expect(screen).toContain('Shep learned from "Billing UI"');
    expect(screen).toContain('+ skills/testing/SKILL.md');
    expect(screen).toContain('Run the unit tests before committing.');
  });

  it('colours file headers only, never a bullet line inside a file', () => {
    const preview = '~ guardrails.md\n- Never edit generated files.\n\n- old-notes.md';
    view.setItems(
      harnessDecisionItems([
        harnessQuestion('v3', {
          decision: buildHarnessChangeDecision('pending', 'v3', 'Change?', preview),
        }),
      ])
    );
    const lines = view.render(100, 30);
    const raw = (text: string) => lines.find((l) => l.replace(ANSI, '').trim() === text)!;
    expect(raw('- Never edit generated files.')).toBe(
      raw('- Never edit generated files.').replace(ANSI, '')
    );
    expect(raw('- old-notes.md')).not.toBe(raw('- old-notes.md').replace(ANSI, ''));
    expect(raw('~ guardrails.md')).not.toBe(raw('~ guardrails.md').replace(ANSI, ''));
  });

  it('renders exactly the height it is given, never wider than the width', () => {
    const lines = view.render(60, 12);

    expect(lines).toHaveLength(12);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
  });

  it('says so when nothing waits', () => {
    view.setItems([]);

    expect(plain(view.render(80, 10))).toContain('No harness change is waiting for you');
    view.handleInput('a');
    expect(intents.adopt).not.toHaveBeenCalled();
  });

  it('adopts the selected decision with a', () => {
    view.handleInput('a');

    expect(intents.adopt).toHaveBeenCalledWith(items[0]);
  });

  it('moves the selection before acting', () => {
    view.handleInput(KEY.down);
    view.handleInput('a');

    expect(intents.adopt).toHaveBeenCalledWith(items[1]);
  });

  it('rejects with the typed feedback', () => {
    view.handleInput('r');
    expect(view.prompt?.label).toContain('Reject');
    type('Too broad');
    view.handleInput(KEY.enter);

    expect(intents.reject).toHaveBeenCalledWith(items[0], 'Too broad');
    expect(view.prompt).toBeUndefined();
  });

  it('rejects without feedback on an empty line', () => {
    view.handleInput('r');
    view.handleInput(KEY.enter);

    expect(intents.reject).toHaveBeenCalledWith(items[0], undefined);
  });

  it('esc in the feedback line cancels the reject; esc again closes the view', () => {
    view.handleInput('r');
    view.handleInput(KEY.escape);

    expect(view.prompt).toBeUndefined();
    expect(intents.close).not.toHaveBeenCalled();

    view.handleInput(KEY.escape);
    expect(intents.close).toHaveBeenCalled();
  });

  it('letters typed as feedback are text, not keys', () => {
    view.handleInput('r');
    type('a');

    expect(intents.adopt).not.toHaveBeenCalled();
  });

  it('ctrl+c quits from anywhere', () => {
    view.handleInput('r');
    view.handleInput(KEY.ctrlC);

    expect(intents.quit).toHaveBeenCalled();
  });

  it('keeps the selection on the same decision when the list refreshes', () => {
    view.handleInput(KEY.down);
    view.setItems([items[1]]);
    view.handleInput('a');

    expect(intents.adopt).toHaveBeenCalledWith(items[1]);
  });
});
