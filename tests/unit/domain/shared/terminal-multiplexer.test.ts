/**
 * detectTerminalMultiplexer Unit Tests (spec 143)
 *
 * A multiplexer counts only when its session variable proves a live session
 * the console can split. SHEP_MULTIPLEXER overrides detection.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { TerminalMultiplexer } from '@/domain/generated/output.js';
import {
  MULTIPLEXER_OVERRIDE_VARIABLE,
  detectTerminalMultiplexer,
} from '@/domain/shared/terminal-multiplexer.js';

describe('detectTerminalMultiplexer', () => {
  it('finds nothing in a plain terminal', () => {
    expect(detectTerminalMultiplexer({ TERM: 'xterm-256color' })).toBeUndefined();
  });

  it.each([
    [{ TMUX: '/tmp/tmux-1000/default,123,0' }, TerminalMultiplexer.Tmux],
    [{ ZELLIJ: '0' }, TerminalMultiplexer.Zellij],
    [{ WEZTERM_PANE: '3' }, TerminalMultiplexer.WezTerm],
    [{ KITTY_WINDOW_ID: '1' }, TerminalMultiplexer.Kitty],
  ])('detects %o', (env, expected) => {
    expect(detectTerminalMultiplexer(env)).toBe(expected);
  });

  it('prefers tmux, then Zellij, then WezTerm, then kitty', () => {
    // tmux running inside a kitty or WezTerm window is the session that splits.
    expect(detectTerminalMultiplexer({ KITTY_WINDOW_ID: '1', WEZTERM_PANE: '2', TMUX: 'x' })).toBe(
      TerminalMultiplexer.Tmux
    );
    expect(detectTerminalMultiplexer({ KITTY_WINDOW_ID: '1', ZELLIJ: '0' })).toBe(
      TerminalMultiplexer.Zellij
    );
    expect(detectTerminalMultiplexer({ KITTY_WINDOW_ID: '1', WEZTERM_PANE: '2' })).toBe(
      TerminalMultiplexer.WezTerm
    );
  });

  it('ignores empty variables', () => {
    expect(detectTerminalMultiplexer({ TMUX: '', ZELLIJ: '' })).toBeUndefined();
  });

  it('does not take TERM or TERM_PROGRAM as proof of a live session', () => {
    expect(detectTerminalMultiplexer({ TERM: 'tmux-256color', TERM_PROGRAM: 'tmux' })).toBe(
      undefined
    );
  });

  it('lets the override pick a multiplexer, or turn detection off', () => {
    expect(
      detectTerminalMultiplexer({ TMUX: 'x', [MULTIPLEXER_OVERRIDE_VARIABLE]: 'zellij' })
    ).toBe(TerminalMultiplexer.Zellij);
    expect(
      detectTerminalMultiplexer({ TMUX: 'x', [MULTIPLEXER_OVERRIDE_VARIABLE]: 'none' })
    ).toBeUndefined();
    expect(
      detectTerminalMultiplexer({ TMUX: 'x', [MULTIPLEXER_OVERRIDE_VARIABLE]: 'WezTerm' })
    ).toBe(TerminalMultiplexer.WezTerm);
  });

  it('falls back to detection when the override names nothing it knows', () => {
    expect(
      detectTerminalMultiplexer({ TMUX: 'x', [MULTIPLEXER_OVERRIDE_VARIABLE]: 'screen' })
    ).toBe(TerminalMultiplexer.Tmux);
  });
});
