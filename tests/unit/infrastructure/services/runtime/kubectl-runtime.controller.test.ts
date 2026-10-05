import { describe, it, expect, vi } from 'vitest';
import {
  KubectlRuntimeController,
  MAX_EVIDENCE_CHARS,
} from '@/infrastructure/services/runtime/kubectl-runtime.controller.js';

const TARGET = { context: 'prod', namespace: 'shop', workload: 'checkout' };
const SCOPE = ['--context', 'prod', '--namespace', 'shop'];

function fakeExec(handler: (args: string[]) => string | Error) {
  return vi.fn(async (_file: string, args: string[]) => {
    const result = handler(args);
    if (result instanceof Error) throw Object.assign(result, { stderr: result.message });
    return { stdout: result, stderr: '' };
  });
}

describe('KubectlRuntimeController', () => {
  it('runs restart, rollback and scale on the workload in its context and namespace', async () => {
    const exec = fakeExec((args) => `ok ${args.join(' ')}`);
    const controller = new KubectlRuntimeController(exec);
    await controller.restart(TARGET);
    await controller.rollback(TARGET);
    const output = await controller.scale(TARGET, 6);
    expect(exec.mock.calls.map((call) => call[1])).toEqual([
      [...SCOPE, 'rollout', 'restart', 'deployment/checkout'],
      [...SCOPE, 'rollout', 'undo', 'deployment/checkout'],
      [...SCOPE, 'scale', 'deployment/checkout', '--replicas=6'],
    ]);
    expect(exec.mock.calls.every((call) => call[0] === 'kubectl')).toBe(true);
    expect(output).toContain('--replicas=6');
  });

  it('omits the context when the target has none', async () => {
    const exec = fakeExec(() => 'ok');
    await new KubectlRuntimeController(exec).restart({ namespace: 'shop', workload: 'checkout' });
    expect(exec.mock.calls[0][1]).toEqual([
      '--namespace',
      'shop',
      'rollout',
      'restart',
      'deployment/checkout',
    ]);
  });

  it('gathers evidence, keeping going past a failing part and bounding each', async () => {
    const exec = fakeExec((args) => {
      if (args.includes('logs')) return 'x'.repeat(MAX_EVIDENCE_CHARS * 2);
      if (args.includes('events')) return new Error('forbidden: events');
      return 'checkout 2/3 ready';
    });
    const evidence = await new KubectlRuntimeController(exec).evidence(TARGET);
    expect(evidence.status).toBe('checkout 2/3 ready');
    expect(evidence.events).toContain('forbidden: events');
    expect(evidence.logs.length).toBeLessThanOrEqual(MAX_EVIDENCE_CHARS + 20);
    expect(exec.mock.calls.find((call) => call[1].includes('logs'))?.[1]).toEqual(
      expect.arrayContaining(['deployment/checkout', '--all-containers=true'])
    );
  });

  it('reports recovery from rollout status', async () => {
    const ready = await new KubectlRuntimeController(
      fakeExec(() => 'successfully rolled out')
    ).verify(TARGET, 120);
    expect(ready).toEqual({ recovered: true, detail: 'successfully rolled out' });
    const stuck = new KubectlRuntimeController(fakeExec(() => new Error('timed out waiting')));
    expect(await stuck.verify(TARGET, 120)).toEqual({
      recovered: false,
      detail: 'timed out waiting',
    });
  });

  it('turns a failing action into an error with the command output', async () => {
    const controller = new KubectlRuntimeController(
      fakeExec(() => new Error('deployments.apps "checkout" not found'))
    );
    await expect(controller.rollback(TARGET)).rejects.toThrow('not found');
  });
});
