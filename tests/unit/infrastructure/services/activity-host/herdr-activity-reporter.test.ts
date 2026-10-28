/**
 * Herdr activity reporter (spec 149).
 *
 * Follows Herdr's "supported by the agent" protocol: `pane report-agent`
 * with a state and a strictly increasing `--seq`, `release-agent` on exit,
 * in the background, the latest report winning, failures ignored.
 * TDD: RED-GREEN-REFACTOR.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentActivityState } from '@/domain/generated/output.js';
import {
  HerdrActivityReporter,
  herdrEnvironment,
} from '@/infrastructure/services/activity-host/herdr-activity-reporter.js';
import { NoopActivityReporter } from '@/infrastructure/services/activity-host/noop-activity-reporter.js';

const ENV = { binPath: '/opt/herdr/bin/herdr', paneId: 'w1:p2' };

interface Call {
  file: string;
  args: string[];
  options?: object;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** An exec double whose calls stay pending until the test settles them. */
function deferredExec() {
  const calls: Call[] = [];
  const exec = vi.fn(
    (file: string, args: string[], options?: object) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        calls.push({
          file,
          args,
          options,
          resolve: () => resolve({ stdout: '', stderr: '' }),
          reject,
        });
      })
  );
  return { exec, calls };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('herdrEnvironment', () => {
  it('needs HERDR_ENV=1, the pane id and the binary path', () => {
    expect(
      herdrEnvironment({ HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p2', HERDR_BIN_PATH: '/x/herdr' })
    ).toEqual({ binPath: '/x/herdr', paneId: 'w1:p2' });
    expect(
      herdrEnvironment({ HERDR_PANE_ID: 'w1:p2', HERDR_BIN_PATH: '/x/herdr' })
    ).toBeUndefined();
    expect(herdrEnvironment({ HERDR_ENV: '1', HERDR_BIN_PATH: '/x/herdr' })).toBeUndefined();
    expect(herdrEnvironment({ HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p2' })).toBeUndefined();
    expect(
      herdrEnvironment({ HERDR_ENV: '0', HERDR_PANE_ID: 'w1:p2', HERDR_BIN_PATH: '/x/herdr' })
    ).toBeUndefined();
  });
});

describe('HerdrActivityReporter', () => {
  it('reports with the exact argv Herdr documents, no shell, a short timeout', async () => {
    const { exec, calls } = deferredExec();
    const reporter = new HerdrActivityReporter(exec, ENV, () => 1_000);

    reporter.report({ state: AgentActivityState.Blocked, message: '1 feature needs you' });
    await flush();

    expect(reporter.available).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe('/opt/herdr/bin/herdr');
    expect(calls[0].args).toEqual([
      'pane',
      'report-agent',
      'w1:p2',
      '--source',
      'shep',
      '--agent',
      'shep',
      '--state',
      'blocked',
      '--seq',
      '1000',
      '--message',
      '1 feature needs you',
    ]);
    expect(calls[0].options).toMatchObject({ timeout: expect.any(Number), windowsHide: true });
  });

  it('maps working through and everything that is not working or blocked to idle', async () => {
    const { exec, calls } = deferredExec();
    let clock = 0;
    const reporter = new HerdrActivityReporter(exec, ENV, () => (clock += 1));

    for (const state of [
      AgentActivityState.Working,
      AgentActivityState.Waiting,
      AgentActivityState.Done,
      AgentActivityState.Failed,
    ]) {
      reporter.report({ state });
      await flush();
      calls.at(-1)?.resolve();
      await flush();
    }

    const states = calls.map((c) => c.args[c.args.indexOf('--state') + 1]);
    expect(states).toEqual(['working', 'idle', 'idle', 'idle']);
  });

  it('keeps the sequence strictly increasing even when the clock does not move', async () => {
    const { exec, calls } = deferredExec();
    const reporter = new HerdrActivityReporter(exec, ENV, () => 5_000);

    for (const state of [AgentActivityState.Working, AgentActivityState.Blocked]) {
      reporter.report({ state });
      await flush();
      calls.at(-1)?.resolve();
      await flush();
    }

    const seqs = calls.map((c) => Number(c.args[c.args.indexOf('--seq') + 1]));
    expect(seqs).toEqual([5_000, 5_001]);
  });

  it('sends one report at a time; reports made meanwhile collapse into the latest', async () => {
    const { exec, calls } = deferredExec();
    let clock = 100;
    const reporter = new HerdrActivityReporter(exec, ENV, () => (clock += 1));

    reporter.report({ state: AgentActivityState.Working });
    await flush();
    reporter.report({ state: AgentActivityState.Blocked });
    reporter.report({ state: AgentActivityState.Done });
    await flush();
    expect(calls).toHaveLength(1);

    calls[0].resolve();
    await flush();
    await flush();

    expect(calls).toHaveLength(2);
    expect(calls[1].args).toContain('idle');
  });

  it('ignores a failing or missing herdr', async () => {
    const { exec, calls } = deferredExec();
    const reporter = new HerdrActivityReporter(exec, ENV, () => 1);

    reporter.report({ state: AgentActivityState.Working });
    await flush();
    calls[0].reject(new Error('spawn ENOENT'));
    await flush();
    reporter.report({ state: AgentActivityState.Blocked });
    await flush();

    expect(calls).toHaveLength(2);
  });

  it('releases the pane after any report in flight, dropping queued ones', async () => {
    const { exec, calls } = deferredExec();
    let clock = 10;
    const reporter = new HerdrActivityReporter(exec, ENV, () => (clock += 1));

    reporter.report({ state: AgentActivityState.Working });
    await flush();
    reporter.report({ state: AgentActivityState.Blocked });
    const released = reporter.release();
    calls[0].resolve();
    await flush();
    await flush();
    calls.at(-1)?.resolve();
    await released;

    expect(calls.map((c) => c.args[1])).toEqual(['report-agent', 'release-agent']);
    expect(calls[1].args).toEqual([
      'pane',
      'release-agent',
      'w1:p2',
      '--source',
      'shep',
      '--agent',
      'shep',
      '--seq',
      String(Number(calls[0].args[calls[0].args.indexOf('--seq') + 1]) + 1),
    ]);

    reporter.report({ state: AgentActivityState.Working });
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('release resolves even when herdr fails', async () => {
    const { exec, calls } = deferredExec();
    const reporter = new HerdrActivityReporter(exec, ENV, () => 1);

    const released = reporter.release();
    await flush();
    calls[0].reject(new Error('gone'));

    await expect(released).resolves.toBeUndefined();
  });
});

describe('NoopActivityReporter', () => {
  it('is unavailable and does nothing', async () => {
    const reporter = new NoopActivityReporter();
    expect(reporter.available).toBe(false);
    expect(() => reporter.report({ state: AgentActivityState.Working })).not.toThrow();
    await expect(reporter.release()).resolves.toBeUndefined();
  });
});
