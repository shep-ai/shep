import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClusterStatus } from '@/domain/generated/output.js';
import type { Cluster } from '@/domain/generated/output.js';

// Use vi.hoisted so mock fns are available when vi.mock factories run
const {
  mockInitializeContainer,
  mockResolve,
  mockGraphInvoke,
  mockCreateClusterAgentGraph,
  mockCreateCheckpointer,
} = vi.hoisted(() => ({
  mockInitializeContainer: vi.fn(),
  mockResolve: vi.fn(),
  mockGraphInvoke: vi.fn(),
  mockCreateClusterAgentGraph: vi.fn(),
  mockCreateCheckpointer: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  initializeContainer: () => mockInitializeContainer(),
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('@/infrastructure/services/agents/cluster-agent/cluster-agent-graph.js', () => ({
  createClusterAgentGraph: (...args: unknown[]) => mockCreateClusterAgentGraph(...args),
}));

vi.mock('@/infrastructure/services/agents/common/checkpointer.js', () => ({
  createCheckpointer: (...args: unknown[]) => mockCreateCheckpointer(...args),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: () => ({
    agent: { type: 'claude-code', authMethod: 'token', token: 'test' },
  }),
  initializeSettings: vi.fn(),
}));

import {
  parseClusterWorkerArgs,
  runClusterWorker,
  handleUncaughtWorkerException,
  handleUnhandledWorkerRejection,
} from '@/infrastructure/services/agents/cluster-agent/cluster-agent-worker.js';

function makeMockCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'cluster-1',
    name: 'test-cluster',
    slug: 'test-cluster',
    status: ClusterStatus.Provisioning,
    nodeCount: 1,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Cluster;
}

function makeMockClusterRepository(cluster: Cluster) {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(cluster),
    findBySlug: vi.fn().mockResolvedValue(cluster),
    list: vi.fn().mockResolvedValue([cluster]),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

const CLUSTER_CHECKPOINT_DIR = '/tmp/shep-test/checkpoints';

function clusterCheckpointPath(checkpointId: string): string {
  return `${CLUSTER_CHECKPOINT_DIR}/cluster-${checkpointId}.db`;
}

/** Tokens the worker resolves purely to hand on to the graph — an opaque stub is enough. */
const OPAQUE_GRAPH_DEPENDENCY_TOKENS = [
  'IK3dService',
  'IKubectlService',
  'IArgoCDService',
  'IDockerHealthService',
] as const;

/**
 * Stubs every token `runClusterWorker` resolves from the container, and throws on any other
 * token. Resolving an unknown token to a bare `{}` would let a newly added worker dependency
 * pass here and only blow up as a `TypeError` deep inside the call, so every dependency has
 * to be taught to this one place.
 */
function makeMockContainerResolve(clusterRepo: ReturnType<typeof makeMockClusterRepository>) {
  return (token: unknown) => {
    const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
    if (key === 'IClusterRepository') return clusterRepo;
    if (key === 'IAgentCheckpointService') {
      return { getClusterCheckpointPath: vi.fn(clusterCheckpointPath) };
    }
    if (key === 'InitializeSettingsUseCase') {
      return {
        execute: vi.fn().mockResolvedValue({
          agent: { type: 'claude-code', authMethod: 'token', token: 'test' },
        }),
      };
    }
    if (
      OPAQUE_GRAPH_DEPENDENCY_TOKENS.includes(
        key as (typeof OPAQUE_GRAPH_DEPENDENCY_TOKENS)[number]
      )
    ) {
      return {};
    }
    throw new Error(`Unstubbed container token in cluster-agent-worker test: ${String(key)}`);
  };
}

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

describe('runClusterWorker checkpoint wiring', () => {
  it('should build the checkpointer from the injected checkpoint service path', async () => {
    vi.clearAllMocks();
    const mockClusterRepo = makeMockClusterRepository(makeMockCluster());
    mockInitializeContainer.mockResolvedValue(undefined);
    mockResolve.mockImplementation(makeMockContainerResolve(mockClusterRepo));
    mockCreateCheckpointer.mockReturnValue({});
    mockGraphInvoke.mockResolvedValue({ error: null });
    mockCreateClusterAgentGraph.mockReturnValue({ invoke: mockGraphInvoke });

    await runClusterWorker({
      clusterId: 'cluster-1',
      runId: 'run-1',
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      resume: false,
      threadId: 'thread-1',
    });

    expect(mockCreateCheckpointer).toHaveBeenCalledWith(clusterCheckpointPath('thread-1'));
  });
});

describe('runClusterWorker crash handling', () => {
  let mockClusterRepo: ReturnType<typeof makeMockClusterRepository>;
  let cluster: Cluster;

  beforeEach(() => {
    vi.clearAllMocks();
    cluster = makeMockCluster();
    mockClusterRepo = makeMockClusterRepository(cluster);
    mockInitializeContainer.mockResolvedValue(undefined);
    mockResolve.mockImplementation(makeMockContainerResolve(mockClusterRepo));
    mockCreateCheckpointer.mockReturnValue({});
    mockGraphInvoke.mockResolvedValue({ error: null });
    mockCreateClusterAgentGraph.mockReturnValue({ invoke: mockGraphInvoke });
  });

  it('should persist status Error with the graph error message when the graph invocation throws (existing catch-block behavior)', async () => {
    mockGraphInvoke.mockRejectedValue(new Error('k3d create failed: docker not running'));

    await runClusterWorker({
      clusterId: 'cluster-1',
      runId: 'run-1',
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      resume: false,
    });

    expect(mockClusterRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: 'k3d create failed: docker not running',
    });
  });

  it('should not persist any status change when the graph invocation succeeds', async () => {
    await runClusterWorker({
      clusterId: 'cluster-1',
      runId: 'run-1',
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      resume: false,
    });

    expect(mockClusterRepo.update).not.toHaveBeenCalled();
  });

  it('should not throw when persisting the crash status itself fails', async () => {
    mockGraphInvoke.mockRejectedValue(new Error('graph blew up'));
    mockClusterRepo.update.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(
      runClusterWorker({
        clusterId: 'cluster-1',
        runId: 'run-1',
        argoCdEnabled: false,
        argoCdNamespace: 'argocd',
        resume: false,
      })
    ).resolves.toBeUndefined();
  });
});

describe('cluster-agent-worker process-level crash handlers', () => {
  let mockClusterRepo: ReturnType<typeof makeMockClusterRepository>;
  let cluster: Cluster;

  beforeEach(async () => {
    vi.clearAllMocks();
    cluster = makeMockCluster();
    mockClusterRepo = makeMockClusterRepository(cluster);
    mockInitializeContainer.mockResolvedValue(undefined);
    mockResolve.mockImplementation(makeMockContainerResolve(mockClusterRepo));
    mockCreateCheckpointer.mockReturnValue({});
    mockGraphInvoke.mockResolvedValue({ error: null });
    mockCreateClusterAgentGraph.mockReturnValue({ invoke: mockGraphInvoke });

    // Populate the module's signal-handling context (clusterIdForSignal/clusterRepoForSignal)
    // the same way production code does — by running the worker once.
    await runClusterWorker({
      clusterId: 'cluster-1',
      runId: 'run-1',
      argoCdEnabled: false,
      argoCdNamespace: 'argocd',
      resume: false,
    });
    mockClusterRepo.update.mockClear();
  });

  it('should persist a distinguishing errorMessage on an uncaught exception', async () => {
    await handleUncaughtWorkerException(new Error('segfault in native binding'));

    expect(mockClusterRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage:
        'Provisioning worker crashed with an uncaught exception: segfault in native binding',
    });
  });

  it('should persist a distinguishing errorMessage on an unhandled promise rejection', async () => {
    await handleUnhandledWorkerRejection(new Error('ECONNREFUSED'));

    expect(mockClusterRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage: 'Provisioning worker crashed with an unhandled promise rejection: ECONNREFUSED',
    });
  });

  it('should stringify a non-Error unhandled rejection reason', async () => {
    await handleUnhandledWorkerRejection('plain string rejection');

    expect(mockClusterRepo.update).toHaveBeenCalledWith('cluster-1', {
      status: ClusterStatus.Error,
      errorMessage:
        'Provisioning worker crashed with an unhandled promise rejection: plain string rejection',
    });
  });

  it('should produce distinguishable messages for uncaughtException vs unhandledRejection', async () => {
    await handleUncaughtWorkerException(new Error('boom-a'));
    const uncaughtMessage = mockClusterRepo.update.mock.calls[0][1].errorMessage;

    mockClusterRepo.update.mockClear();

    await handleUnhandledWorkerRejection(new Error('boom-b'));
    const rejectionMessage = mockClusterRepo.update.mock.calls[0][1].errorMessage;

    expect(uncaughtMessage).not.toBe(rejectionMessage);
    expect(uncaughtMessage).toContain('uncaught exception');
    expect(rejectionMessage).toContain('unhandled promise rejection');
  });

  it('should not throw when persisting the crash itself fails', async () => {
    mockClusterRepo.update.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(handleUncaughtWorkerException(new Error('boom'))).resolves.toBeUndefined();
  });
});
