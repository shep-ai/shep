import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { basename } from 'node:path';
import {
  ConptyHostReaper,
  parseConsoleHostOutput,
  parseTasklistImage,
} from '../../../../../packages/core/src/infrastructure/services/terminal/conpty-host-reaper.js';

const IS_WINDOWS = process.platform === 'win32';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('parseConsoleHostOutput', () => {
  it('reads the host pid and image', () => {
    expect(parseConsoleHostOutput('7324 conhost.exe\r\n')).toEqual({
      pid: 7324,
      image: 'conhost.exe',
    });
  });

  it('returns null when the shell had no host', () => {
    expect(parseConsoleHostOutput('')).toBeNull();
    expect(parseConsoleHostOutput('0 conhost.exe')).toBeNull();
  });
});

describe('parseTasklistImage', () => {
  it('reads the image of the matching row', () => {
    const csv = '"conhost.exe","7324","Console","1","6,512 K"\r\n';
    expect(parseTasklistImage(csv)).toBe('conhost.exe');
  });

  it('returns null when no process matches', () => {
    const info = 'INFO: No tasks are running which match the specified criteria.\r\n';
    expect(parseTasklistImage(info)).toBeNull();
  });
});

describe('ConptyHostReaper.reap', () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill();
    child = undefined;
  });

  function spawnIdleNode(): ChildProcess {
    child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return child;
  }

  it('leaves a process alone when its image no longer matches the capture', async () => {
    const { pid } = spawnIdleNode();

    await new ConptyHostReaper().reap([{ pid: pid!, image: 'recycled-pid.exe' }]);

    expect(isAlive(pid!)).toBe(true);
  });

  it('resolves for a process that has already exited', async () => {
    const proc = spawnIdleNode();
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;

    await expect(
      new ConptyHostReaper().reap([{ pid: proc.pid!, image: 'node.exe' }])
    ).resolves.toBeUndefined();
  });

  it.runIf(IS_WINDOWS)('terminates a surviving process by its captured pid', async () => {
    const { pid } = spawnIdleNode();

    await new ConptyHostReaper().reap([{ pid: pid!, image: basename(process.execPath) }]);

    expect(isAlive(pid!)).toBe(false);
  });
});
