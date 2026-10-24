/**
 * terminalNotification Unit Tests (spec 143)
 *
 * The escape sequence that alerts the user: the terminal's own notification
 * where it has one, passed through tmux, and a bare bell everywhere else.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import { terminalNotification } from '@/presentation/tui/feature-console/terminal-notification.js';

const BEL = '\x07';
const ESC = '\x1b';
const ST = `${ESC}\\`;

describe('terminalNotification', () => {
  it('uses OSC 9 in iTerm2', () => {
    expect(terminalNotification({ TERM_PROGRAM: 'iTerm.app' }, 'shep', 'Billing needs you')).toBe(
      `${ESC}]9;shep: Billing needs you${BEL}`
    );
  });

  it('uses OSC 777 in WezTerm and Ghostty', () => {
    const expected = `${ESC}]777;notify;shep;Billing needs you${BEL}`;
    expect(terminalNotification({ TERM_PROGRAM: 'WezTerm' }, 'shep', 'Billing needs you')).toBe(
      expected
    );
    expect(terminalNotification({ TERM_PROGRAM: 'ghostty' }, 'shep', 'Billing needs you')).toBe(
      expected
    );
  });

  it('uses OSC 99 in kitty', () => {
    expect(terminalNotification({ KITTY_WINDOW_ID: '1' }, 'shep', 'Billing needs you')).toBe(
      `${ESC}]99;;shep: Billing needs you${ST}`
    );
  });

  it('rings the bell in a terminal with no known notification', () => {
    expect(terminalNotification({ TERM: 'xterm-256color' }, 'shep', 'x')).toBe(BEL);
  });

  it('wraps the notification for tmux passthrough and rings the bell for tmux itself', () => {
    expect(
      terminalNotification({ TMUX: '/tmp/t,1,0', LC_TERMINAL: 'iTerm2' }, 'shep', 'Billing')
    ).toBe(`${ESC}Ptmux;${ESC}${ESC}]9;shep: Billing${BEL}${ST}${BEL}`);
    expect(terminalNotification({ TMUX: '/tmp/t,1,0', TERM_PROGRAM: 'tmux' }, 'shep', 'x')).toBe(
      BEL
    );
  });

  it('only rings the bell in Zellij, which drops OSC sequences', () => {
    expect(terminalNotification({ ZELLIJ: '0', TERM_PROGRAM: 'WezTerm' }, 'shep', 'x')).toBe(BEL);
  });

  it('strips control characters a feature name could carry', () => {
    expect(
      terminalNotification({ TERM_PROGRAM: 'iTerm.app' }, 'shep', `evil${BEL}${ESC}]0;pwned`)
    ).toBe(`${ESC}]9;shep: evil0;pwned${BEL}`);
  });
});
