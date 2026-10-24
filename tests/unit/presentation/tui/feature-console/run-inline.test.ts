/**
 * runInline Unit Tests (spec 143)
 *
 * Without a multiplexer the console hands its terminal to a shell or a log
 * follower. Ctrl+C must end that command, not the console behind it.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { runInline } from '@/presentation/tui/feature-console/run-inline.js';

class FakeChild extends EventEmitter {}

describe('runInline', () => {
  let child: FakeChild;
  const spawn = vi.fn(() => {
    child = new FakeChild();
    return child as never;
  });
  const out: string[] = [];
  const write = (text: string) => out.push(text);

  afterEach(() => {
    out.length = 0;
    spawn.mockClear();
  });

  it('prints the banner, then runs the command in the directory on this terminal', async () => {
    const done = runInline(
      { cwd: '/wt', command: ['/bin/zsh', '-l'], banner: 'Shell in /wt.' },
      { spawn, write }
    );

    expect(out.join('')).toContain('Shell in /wt.');
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-l'], { cwd: '/wt', stdio: 'inherit' });
    child.emit('exit', 0, null);
    await done;
  });

  it('ignores ctrl+c in the console while the command runs, and only then', async () => {
    const before = process.listenerCount('SIGINT');
    const done = runInline({ cwd: '/wt', command: ['tail'], banner: '' }, { spawn, write });

    expect(process.listenerCount('SIGINT')).toBe(before + 1);
    child.emit('exit', null, 'SIGINT');
    await done;
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('fails with the reason when the command cannot start', async () => {
    const before = process.listenerCount('SIGINT');
    const done = runInline({ cwd: '/wt', command: ['nope'], banner: '' }, { spawn, write });

    child.emit('error', Object.assign(new Error('spawn nope ENOENT'), { code: 'ENOENT' }));

    await expect(done).rejects.toThrow('spawn nope ENOENT');
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
