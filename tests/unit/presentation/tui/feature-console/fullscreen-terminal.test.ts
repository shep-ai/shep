/**
 * FullscreenTerminal Unit Tests (spec 142)
 *
 * The console lives on the alternate screen: entered before the wrapped
 * terminal starts listening, left only after it has stopped, so the user's
 * shell screen and scrollback come back untouched.
 */

import { describe, it, expect } from 'vitest';

import { FullscreenTerminal } from '@/presentation/tui/feature-console/fullscreen-terminal.js';
import { FakeTerminal } from '@tests/helpers/tui/fake-terminal.js';

const ENTER = '\x1b[?1049h';
const LEAVE = '\x1b[?1049l';

describe('FullscreenTerminal', () => {
  it('enters the alternate screen before the wrapped terminal starts', () => {
    const inner = new FakeTerminal();
    new FullscreenTerminal(inner).start(
      () => undefined,
      () => undefined
    );

    const enter = inner.calls.findIndex((c) => c.startsWith('write:') && c.includes(ENTER));
    expect(enter).toBeGreaterThanOrEqual(0);
    expect(enter).toBeLessThan(inner.calls.indexOf('start'));
  });

  it('leaves the alternate screen after the wrapped terminal stops, once', () => {
    const inner = new FakeTerminal();
    const terminal = new FullscreenTerminal(inner);
    terminal.start(
      () => undefined,
      () => undefined
    );
    terminal.stop();
    terminal.stop();

    expect(inner.calls.filter((c) => c === `write:${LEAVE}`)).toHaveLength(1);
    expect(inner.calls.indexOf(`write:${LEAVE}`)).toBeGreaterThan(inner.calls.indexOf('stop'));
  });

  it('passes size, writes and input straight through', () => {
    const inner = new FakeTerminal(132, 43);
    const terminal = new FullscreenTerminal(inner);
    const typed: string[] = [];
    terminal.start(
      (data) => typed.push(data),
      () => undefined
    );

    terminal.write('hello');
    inner.type('q');

    expect(terminal.columns).toBe(132);
    expect(terminal.rows).toBe(43);
    expect(inner.output).toContain('hello');
    expect(typed).toEqual(['q']);
  });
});
