/**
 * Status segment Unit Tests (spec 146)
 *
 * One line for status bars: how many features need the user, and what runs
 * or failed. Plain for prompts, tmux-styled for status-right.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';
import { initI18n } from '@/presentation/tui/i18n.js';
import {
  StatusSegmentStyle,
  formatStatusSegment,
  tmuxStatusOptions,
} from '@/presentation/tui/feature-console/status-segment.js';

const summary = (overrides = {}) => ({
  total: 6,
  needsAttention: 2,
  running: 3,
  waiting: 0,
  failed: 1,
  done: 0,
  ...overrides,
});

describe('formatStatusSegment', () => {
  let t: TFunction;
  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  it('reads plainly, leaving out what is zero except features needing the user', () => {
    expect(formatStatusSegment(summary(), t, StatusSegmentStyle.Plain)).toBe(
      '◆ 2 needs you · ● 3 running · ✗ 1 failed'
    );
    expect(
      formatStatusSegment(summary({ needsAttention: 0, failed: 0 }), t, StatusSegmentStyle.Plain)
    ).toBe('◆ 0 needs you · ● 3 running');
  });

  it('styles each part for tmux', () => {
    expect(formatStatusSegment(summary(), t, StatusSegmentStyle.Tmux)).toBe(
      '#[fg=yellow,bold]◆ 2 needs you#[default] · #[fg=cyan]● 3 running#[default] · #[fg=red]✗ 1 failed#[default]'
    );
    expect(
      formatStatusSegment(
        summary({ needsAttention: 0, running: 0, failed: 0 }),
        t,
        StatusSegmentStyle.Tmux
      )
    ).toBe('#[fg=colour244]◆ 0 needs you#[default]');
  });

  it('gives tmux the styled segment and the bare count as user options', () => {
    expect(tmuxStatusOptions(summary(), t)).toEqual({
      '@shep_status': formatStatusSegment(summary(), t, StatusSegmentStyle.Tmux),
      '@shep_needs_you': '2',
    });
  });
});
