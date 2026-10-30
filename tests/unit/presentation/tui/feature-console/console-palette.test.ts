/**
 * Command palette Unit Tests (spec 145)
 *
 * The palette lists the console keys that apply to the selected feature,
 * narrows them with fuzzy matching, and hands back the key to run.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';
import { initI18n } from '@/presentation/tui/i18n.js';
import {
  CommandPalette,
  paletteEntries,
} from '@/presentation/tui/feature-console/console-palette.js';
import { ConsoleKey } from '@/presentation/tui/feature-console/console-keys.js';
import { FeatureConsoleAction } from '@/domain/generated/output.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';

const ESC = '\x1b';
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const ENTER = '\r';

// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));

const row = (overrides: Partial<FeatureConsoleRow> = {}) =>
  ({
    featureId: 'feat-1',
    shortId: 'feat-1',
    name: 'Billing',
    runId: 'run-1',
    actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
    ...overrides,
  }) as FeatureConsoleRow;

describe('paletteEntries', () => {
  let t: TFunction;
  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  const keys = (r: FeatureConsoleRow | undefined, filterActive = false) =>
    paletteEntries({ row: r, filterActive }, t).map((e) => e.key);

  it('offers only the actions the core allows for the selected feature', () => {
    const list = keys(row());
    expect(list).toContain(ConsoleKey.Approve);
    expect(list).toContain(ConsoleKey.Reject);
    expect(list).not.toContain(ConsoleKey.Stop);
    expect(list).not.toContain(ConsoleKey.Resume);
  });

  it('offers log commands only for a feature with a run, and none without a feature', () => {
    expect(keys(row({ runId: undefined }))).not.toContain(ConsoleKey.FollowLog);
    expect(keys(row())).toContain(ConsoleKey.FollowLog);
    const none = keys(undefined);
    expect(none).not.toContain(ConsoleKey.Shell);
    expect(none).not.toContain(ConsoleKey.CopyId);
    expect(none).toContain(ConsoleKey.Help);
    expect(none).toContain(ConsoleKey.Quit);
  });

  it('offers the harness decisions only while some wait (spec 150)', () => {
    const offered = (harnessDecisions: number) =>
      paletteEntries({ row: row(), filterActive: false, harnessDecisions }, t).map((e) => e.key);
    expect(keys(row())).not.toContain(ConsoleKey.HarnessDecisions);
    expect(offered(0)).not.toContain(ConsoleKey.HarnessDecisions);
    expect(offered(1)).toContain(ConsoleKey.HarnessDecisions);
  });

  it('offers a new feature only when the console can create one for a repository', () => {
    const offered = (r: FeatureConsoleRow | undefined) =>
      paletteEntries({ row: r, filterActive: false, newFeature: true }, t).map((e) => e.key);
    expect(keys(row())).not.toContain(ConsoleKey.NewFeature);
    expect(offered(row())).toContain(ConsoleKey.NewFeature);
    expect(offered(undefined)).not.toContain(ConsoleKey.NewFeature);
  });

  it('offers clearing the filter only while one is active', () => {
    expect(keys(row())).not.toContain(ConsoleKey.ClearFilter);
    expect(keys(row(), true)).toContain(ConsoleKey.ClearFilter);
  });

  it('shows the key next to each command', () => {
    const approve = paletteEntries({ row: row(), filterActive: false }, t).find(
      (e) => e.key === ConsoleKey.Approve
    );
    expect(approve).toMatchObject({ chord: 'a', label: 'Approve the gate' });
  });
});

describe('CommandPalette', () => {
  let t: TFunction;
  let palette: CommandPalette;
  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  const open = () => {
    palette = new CommandPalette();
    palette.open(paletteEntries({ row: row(), filterActive: false }, t));
  };
  const typeText = (text: string) => {
    for (const ch of text) palette.handleInput(ch);
  };

  it('runs the first entry on enter', () => {
    open();
    expect(palette.handleInput(ENTER)).toEqual({ run: ConsoleKey.Approve });
  });

  it('narrows with fuzzy matching, best first', () => {
    open();
    typeText('cpy');
    expect(palette.visible.map((e) => e.key)[0]).toBe(ConsoleKey.CopyId);
    typeText('zzzz');
    expect(palette.visible).toHaveLength(0);
    expect(palette.handleInput(ENTER)).toEqual({});
  });

  it('moves with the arrows, clamped to the list', () => {
    open();
    palette.handleInput(UP);
    expect(palette.handleInput(ENTER)).toEqual({ run: ConsoleKey.Approve });
    open();
    palette.handleInput(DOWN);
    expect(palette.handleInput(ENTER)).toEqual({ run: ConsoleKey.Reject });
  });

  it('closes on escape', () => {
    open();
    expect(palette.handleInput(ESC)).toEqual({ close: true });
  });

  it('renders the entries with their keys and highlights the selection', () => {
    open();
    const lines = plain(palette.render(80, 10, t));
    expect(lines[0]).toContain('Commands');
    expect(lines.some((l) => l.includes('Approve the gate') && l.includes(' a'))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(10);
  });
});
