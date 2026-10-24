/**
 * Control center window tracking Unit Tests (spec 146)
 *
 * Which features still need a window, what each window should be called, and
 * which names changed since the last snapshot.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { FeatureState } from '@/domain/generated/output.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import {
  ControlCenterWindows,
  featureWindowTitle,
} from '@/presentation/tui/feature-console/control-center.js';

const row = (id: string, state: FeatureState, overrides: Partial<FeatureConsoleRow> = {}) =>
  ({
    featureId: id,
    shortId: id,
    name: `Feature ${id}`,
    state,
    runId: `run-${id}`,
    needsAttention: state === FeatureState.ActionRequired,
    ...overrides,
  }) as FeatureConsoleRow;

describe('featureWindowTitle', () => {
  it('puts the state symbol before the name, and keeps it short', () => {
    expect(featureWindowTitle(row('a', FeatureState.Running))).toBe('● Feature a');
    expect(featureWindowTitle(row('a', FeatureState.ActionRequired))).toBe('◆ Feature a');
    expect(featureWindowTitle(row('a', FeatureState.Done))).toBe('✓ Feature a');
    const long = featureWindowTitle(row('a', FeatureState.Running, { name: 'x'.repeat(80) }));
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long.endsWith('…')).toBe(true);
  });

  it('marks a running feature with an open question like the console does', () => {
    expect(
      featureWindowTitle(
        row('a', FeatureState.Running, { needsAttention: true, pendingQuestions: 1 })
      )
    ).toBe('? Feature a');
  });
});

describe('ControlCenterWindows', () => {
  it('wants a window for each active feature with a run and no window yet', () => {
    const windows = new ControlCenterWindows();
    const rows = [
      row('a', FeatureState.Running),
      row('b', FeatureState.Done),
      row('c', FeatureState.Pending, { runId: undefined }),
      row('d', FeatureState.ActionRequired),
    ];
    expect(windows.candidates(rows).map((c) => c.featureId)).toEqual(['a', 'd']);

    windows.track([{ featureId: 'a', windowId: '@1' }], rows);
    expect(windows.candidates(rows).map((c) => c.featureId)).toEqual(['d']);
  });

  it('renames only windows whose feature changed state, once', () => {
    const windows = new ControlCenterWindows();
    windows.track([{ featureId: 'a', windowId: '@1' }], [row('a', FeatureState.Running)]);

    expect(windows.renames([row('a', FeatureState.Running)])).toEqual([]);
    expect(windows.renames([row('a', FeatureState.ActionRequired)])).toEqual([
      { windowId: '@1', title: '◆ Feature a' },
    ]);
    expect(windows.renames([row('a', FeatureState.ActionRequired)])).toEqual([]);
  });

  it('keeps tracking windows it cannot rename until told they are gone', () => {
    const windows = new ControlCenterWindows();
    // Zellij prints no id: tracked (so C does not reopen it) but never renamed.
    windows.track([{ featureId: 'z' }], [row('z', FeatureState.Running)]);
    expect(windows.candidates([row('z', FeatureState.Running)])).toEqual([]);
    expect(windows.renames([row('z', FeatureState.Done)])).toEqual([]);

    windows.track([{ featureId: 'a', windowId: '@1' }], [row('a', FeatureState.Running)]);
    windows.forget(['@1']);
    expect(windows.candidates([row('a', FeatureState.Running)]).map((c) => c.featureId)).toEqual([
      'a',
    ]);
  });
});
