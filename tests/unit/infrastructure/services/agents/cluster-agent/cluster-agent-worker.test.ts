import { describe, it, expect } from 'vitest';
import { parseClusterWorkerArgs } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-worker.js';

describe('parseClusterWorkerArgs', () => {
  it('should parse required --cluster-id and --run-id', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc-123', '--run-id', 'run-456']);

    expect(args.clusterId).toBe('abc-123');
    expect(args.runId).toBe('run-456');
  });

  it('should throw when --cluster-id is missing', () => {
    expect(() => parseClusterWorkerArgs(['--run-id', 'run-456'])).toThrow(
      'Missing required argument: --cluster-id'
    );
  });

  it('should throw when --run-id is missing', () => {
    expect(() => parseClusterWorkerArgs(['--cluster-id', 'abc-123'])).toThrow(
      'Missing required argument: --run-id'
    );
  });

  it('should default argoCdEnabled to false when flag not present', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc', '--run-id', 'run']);

    expect(args.argoCdEnabled).toBe(false);
  });

  it('should set argoCdEnabled to true when --argocd-enabled flag present', () => {
    const args = parseClusterWorkerArgs([
      '--cluster-id',
      'abc',
      '--run-id',
      'run',
      '--argocd-enabled',
    ]);

    expect(args.argoCdEnabled).toBe(true);
  });

  it('should default argoCdNamespace to argocd', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc', '--run-id', 'run']);

    expect(args.argoCdNamespace).toBe('argocd');
  });

  it('should parse --argocd-namespace when provided', () => {
    const args = parseClusterWorkerArgs([
      '--cluster-id',
      'abc',
      '--run-id',
      'run',
      '--argocd-namespace',
      'custom-ns',
    ]);

    expect(args.argoCdNamespace).toBe('custom-ns');
  });

  it('should default resume to false', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc', '--run-id', 'run']);

    expect(args.resume).toBe(false);
  });

  it('should set resume to true when --resume flag present', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc', '--run-id', 'run', '--resume']);

    expect(args.resume).toBe(true);
  });

  it('should parse --thread-id when provided', () => {
    const args = parseClusterWorkerArgs([
      '--cluster-id',
      'abc',
      '--run-id',
      'run',
      '--thread-id',
      'thread-789',
    ]);

    expect(args.threadId).toBe('thread-789');
  });

  it('should default threadId to undefined when not provided', () => {
    const args = parseClusterWorkerArgs(['--cluster-id', 'abc', '--run-id', 'run']);

    expect(args.threadId).toBeUndefined();
  });

  it('should parse all flags together', () => {
    const args = parseClusterWorkerArgs([
      '--cluster-id',
      'cluster-1',
      '--run-id',
      'run-1',
      '--argocd-enabled',
      '--argocd-namespace',
      'my-argocd',
      '--resume',
      '--thread-id',
      'thread-1',
    ]);

    expect(args).toEqual({
      clusterId: 'cluster-1',
      runId: 'run-1',
      argoCdEnabled: true,
      argoCdNamespace: 'my-argocd',
      resume: true,
      threadId: 'thread-1',
    });
  });
});
