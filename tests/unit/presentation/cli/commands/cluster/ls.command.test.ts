/**
 * Cluster List Command Unit Tests
 *
 * Tests for the cluster ls command that lists clusters
 * in a table view using renderListView.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cluster } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/clusters/list-clusters.use-case.js', () => ({
  ListClustersUseCase: class {
    execute = mockExecute;
  },
}));

import { createLsCommand } from '../../../../../../src/presentation/cli/commands/cluster/ls.command.js';

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

describe('cluster ls command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockReturnValue({ execute: mockExecute });
    process.exitCode = undefined;
  });

  it('should create a command named "ls" with correct description', () => {
    const cmd = createLsCommand();
    expect(cmd.name()).toBe('ls');
    expect(cmd.description()).toBe('List clusters');
  });

  it('should resolve ListClustersUseCase from container', async () => {
    mockExecute.mockResolvedValue([]);
    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(mockResolve).toHaveBeenCalled();
  });

  it('should render table with cluster data', async () => {
    const cluster = makeCluster();
    mockExecute.mockResolvedValue([cluster]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('c1b2a3d4');
    expect(output).toContain('staging');
  });

  it('should show "No clusters found" when list is empty', async () => {
    mockExecute.mockResolvedValue([]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No clusters found');
  });

  it('should show 8-char ID prefix in table', async () => {
    const cluster = makeCluster({ id: 'deadbeef-1234-5678-abcd-ef1234567890' });
    mockExecute.mockResolvedValue([cluster]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('deadbeef');
  });

  it('should display multiple clusters', async () => {
    const cluster1 = makeCluster({ id: 'aaaaaaaa-1111-1111-1111-111111111111', name: 'staging' });
    const cluster2 = makeCluster({
      id: 'bbbbbbbb-2222-2222-2222-222222222222',
      name: 'production',
      status: ClusterStatus.Ready,
    });
    mockExecute.mockResolvedValue([cluster1, cluster2]);

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('staging');
    expect(output).toContain('production');
  });

  it('should set process.exitCode = 1 on error', async () => {
    mockExecute.mockRejectedValue(new Error('DB connection failed'));

    const cmd = createLsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
