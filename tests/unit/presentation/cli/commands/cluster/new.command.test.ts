/**
 * Cluster New Command Unit Tests
 *
 * Tests for the cluster new command that creates a new cluster.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClusterStatus } from '@/domain/generated/output.js';
import type { Cluster } from '@/domain/generated/output.js';

const { mockResolve, mockCreateExecute, mockProvisionExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockCreateExecute: vi.fn(),
  mockProvisionExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/clusters/create-cluster.use-case.js', () => ({
  CreateClusterUseCase: class {
    execute = mockCreateExecute;
  },
}));

vi.mock('@/application/use-cases/clusters/provision-cluster.use-case.js', () => ({
  ProvisionClusterUseCase: class {
    execute = mockProvisionExecute;
  },
}));

import { createNewCommand } from '../../../../../../src/presentation/cli/commands/cluster/new.command.js';

function makeCluster(overrides?: Partial<Cluster>): Cluster {
  return {
    id: 'c1b2a3d4-e5f6-7890-abcd-ef1234567890',
    name: 'staging',
    slug: 'staging',
    status: ClusterStatus.Stopped,
    argoCdEnabled: false,
    argoCdNamespace: 'argocd',
    nodeCount: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('cluster new command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
    mockResolve.mockImplementation((token: unknown) => {
      if (
        token &&
        typeof token === 'function' &&
        (token as { name?: string }).name === 'ProvisionClusterUseCase'
      ) {
        return { execute: mockProvisionExecute };
      }
      return { execute: mockCreateExecute };
    });
    process.exitCode = undefined;
  });

  it('should create a command named "new" with correct description', () => {
    const cmd = createNewCommand();
    expect(cmd.name()).toBe('new');
    expect(cmd.description()).toBe('Create a new cluster');
  });

  it('should create a cluster with name', async () => {
    const cluster = makeCluster();
    mockCreateExecute.mockResolvedValue({ ok: true, cluster });

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging'], { from: 'user' });

    expect(mockCreateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'staging',
      })
    );
  });

  it('should display cluster details after creation', async () => {
    const cluster = makeCluster();
    mockCreateExecute.mockResolvedValue({ ok: true, cluster });

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('c1b2a3d4-e5f6-7890-abcd-ef1234567890');
    expect(output).toContain('staging');
    expect(output).toContain('Stopped');
  });

  it('should pass argoCdEnabled when --argocd is specified', async () => {
    const cluster = makeCluster({ argoCdEnabled: true });
    mockCreateExecute.mockResolvedValue({ ok: true, cluster });

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging', '--argocd'], { from: 'user' });

    expect(mockCreateExecute).toHaveBeenCalledWith(
      expect.objectContaining({ argoCdEnabled: true })
    );
  });

  it('should call ProvisionClusterUseCase when --provision is specified', async () => {
    const cluster = makeCluster();
    mockCreateExecute.mockResolvedValue({ ok: true, cluster });
    mockProvisionExecute.mockResolvedValue({ ok: true });

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging', '--provision'], { from: 'user' });

    expect(mockProvisionExecute).toHaveBeenCalledWith(cluster.id);
  });

  it('should not provision when --provision is not specified', async () => {
    const cluster = makeCluster();
    mockCreateExecute.mockResolvedValue({ ok: true, cluster });

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging'], { from: 'user' });

    expect(mockProvisionExecute).not.toHaveBeenCalled();
  });

  it('should set process.exitCode = 1 when create returns error', async () => {
    mockCreateExecute.mockResolvedValue({ ok: false, error: 'Name is required' });

    const cmd = createNewCommand();
    await cmd.parseAsync([''], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('should set process.exitCode = 1 on exception', async () => {
    mockCreateExecute.mockRejectedValue(new Error('DB connection failed'));

    const cmd = createNewCommand();
    await cmd.parseAsync(['staging'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
