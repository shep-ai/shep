/**
 * NewFeatureView Unit Tests (spec 150, task-28 — TUI create flow)
 *
 * `N` in the console creates a feature in the selected feature's repository.
 * With the selfLearning flag on the form offers Explore for this feature only,
 * with its k; with the flag off the choice is absent and nothing about Explore
 * reaches the create input.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';
import { visibleWidth } from '@mariozechner/pi-tui';

import { initI18n } from '@/presentation/tui/i18n.js';
import {
  NewFeatureView,
  type NewFeatureIntents,
} from '@/presentation/tui/feature-console/new-feature-view.js';
import { MAX_EXPLORE_K } from '@/domain/harness-learning/learning-config.js';

const ESC = '\x1b';
const KEY = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  tab: '\t',
  enter: '\r',
  escape: ESC,
  ctrlC: '\x03',
} as const;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b_[^\x07]*\x07/g;
const plain = (lines: string[]) => lines.map((l) => l.replace(ANSI, '')).join('\n');

const REPOSITORY = { name: 'acme-web', path: '/work/acme-web' };

describe('NewFeatureView', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  function setup(explore?: { defaultK: number }) {
    const intents: { [K in keyof NewFeatureIntents]: ReturnType<typeof vi.fn> } = {
      create: vi.fn(),
      close: vi.fn(),
      quit: vi.fn(),
    };
    const view = new NewFeatureView(t, intents as unknown as NewFeatureIntents, explore);
    view.open(REPOSITORY);
    const type = (text: string) => [...text].forEach((c) => view.handleInput(c));
    return { view, intents, type };
  }

  describe('with the selfLearning flag on', () => {
    it('offers Explore, off by default, with its cost', () => {
      const { view } = setup({ defaultK: 2 });
      const screen = plain(view.render(100, 12));

      expect(screen).toContain('New feature in acme-web');
      expect(screen).toContain('Explore');
      expect(screen).toContain('off');
      expect(screen).toContain('about 4× the implement step at k = 1');
    });

    it('tab turns Explore on; up and down choose k within 1..MAX_EXPLORE_K', () => {
      const { view, intents, type } = setup({ defaultK: 2 });
      view.handleInput(KEY.tab);
      expect(plain(view.render(100, 12))).toMatch(/Explore\s+on/);

      view.handleInput(KEY.up);
      type('Add dark mode');
      view.handleInput(KEY.enter);

      expect(intents.create).toHaveBeenCalledWith({
        repositoryPath: '/work/acme-web',
        userInput: 'Add dark mode',
        exploreHarness: true,
        exploreK: 3,
      });
    });

    it('never leaves the valid k range', () => {
      const { view, intents, type } = setup({ defaultK: 1 });
      view.handleInput(KEY.tab);
      view.handleInput(KEY.down);
      for (let i = 0; i < MAX_EXPLORE_K + 3; i++) view.handleInput(KEY.up);
      type('x');
      view.handleInput(KEY.enter);

      expect(intents.create).toHaveBeenCalledWith(
        expect.objectContaining({ exploreK: MAX_EXPLORE_K })
      );
    });

    it('creates without Explore when it stays off', () => {
      const { view, intents, type } = setup({ defaultK: 2 });
      type('Add dark mode');
      view.handleInput(KEY.enter);

      expect(intents.create).toHaveBeenCalledWith({
        repositoryPath: '/work/acme-web',
        userInput: 'Add dark mode',
      });
    });

    it('arrow keys change nothing while Explore is off', () => {
      const { view, intents, type } = setup({ defaultK: 2 });
      view.handleInput(KEY.up);
      view.handleInput(KEY.tab);
      type('x');
      view.handleInput(KEY.enter);

      expect(intents.create).toHaveBeenCalledWith(expect.objectContaining({ exploreK: 2 }));
    });
  });

  describe('with the selfLearning flag off', () => {
    it('shows no Explore choice', () => {
      const { view } = setup(undefined);
      const screen = plain(view.render(100, 12));

      expect(screen).toContain('New feature in acme-web');
      expect(screen).not.toContain('Explore');
    });

    it('passes nothing about Explore into the create input, even after tab', () => {
      const { view, intents, type } = setup(undefined);
      view.handleInput(KEY.tab);
      type('Add dark mode');
      view.handleInput(KEY.enter);

      expect(intents.create).toHaveBeenCalledWith({
        repositoryPath: '/work/acme-web',
        userInput: 'Add dark mode',
      });
    });
  });

  it('describes the feature on the status line', () => {
    const { view, type } = setup(undefined);
    type('Add');

    expect(view.prompt?.label).toBe('describe');
    expect(view.prompt?.input.getValue()).toBe('Add');
  });

  it('does not create from an empty description', () => {
    const { view, intents } = setup(undefined);
    view.handleInput(KEY.enter);

    expect(intents.create).not.toHaveBeenCalled();
  });

  it('esc closes without creating; ctrl+c quits', () => {
    const { view, intents } = setup(undefined);
    view.handleInput(KEY.escape);
    expect(intents.close).toHaveBeenCalled();
    view.handleInput(KEY.ctrlC);
    expect(intents.quit).toHaveBeenCalled();
    expect(intents.create).not.toHaveBeenCalled();
  });

  it('renders exactly the height it is given, never wider than the width', () => {
    const { view } = setup({ defaultK: 1 });
    const lines = view.render(40, 9);

    expect(lines).toHaveLength(9);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
