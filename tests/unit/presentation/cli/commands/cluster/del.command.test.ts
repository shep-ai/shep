/**
 * Cluster Delete Command Unit Tests
 *
 * Tests for the cluster del command that soft-deletes a cluster
 * after confirmation.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cluster } from '@/domain/generated/output.js';
import { ClusterStatus } from '@/domain/generated/output.js';

const { mockResolve, mockDeleteExecute, mockFindById, mockFindBySlug, mockList, mockConfirm } =
  vi.hoisted(() => ({
    mockResolve: vi.fn(),
    mockDeleteExecute: vi.fn(),
    mockFindById: vi.fn(),
    mockFindBySlug: vi.fn(),
    mockList: vi.fn(),
    mockConfirm: vi.fn(),
  }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/clusters/delete-cluster.use-case.js', () => ({
  DeleteClusterUseCase: class {
    execute = mockDeleteExecute;
  },
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));

import { createDelCommand } from '../../../../../../src/presentation/cli/commands/cluster/del.command.js';

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

describe('cluster del command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    const cluster = makeCluster();
    mockResolve.mockImplementation((token: unknown) => {
      if (token === 'IClusterRepository') {
        return {
          findById: mockFindById,
          findBySlug: mockFindBySlug,
          list: mockList,
        };
      }
      return { execute: mockDeleteExecute };
    });
    mockFindById.mockResolvedValue(cluster);
    mockFindBySlug.mockResolvedValue(null);
    mockList.mockResolvedValue([]);
    mockDeleteExecute.mockResolvedValue({ ok: true });
    mockConfirm.mockResolvedValue(true);
    process.exitCode = undefined;
  });

  it('should create a command named "del" with correct description', () => {
    const cmd = createDelCommand();
    expect(cmd.name()).toBe('del');
    expect(cmd.description()).toBe('Delete a cluster');
  });

  it('should call DeleteClusterUseCase.execute after confirmation', async () => {
    mockConfirm.mockResolvedValue(true);

    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890'], { from: 'user' });

    expect(mockDeleteExecute).toHaveBeenCalledWith('c1b2a3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('should display success message after deletion', async () => {
    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('staging');
  });

  it('should not delete when confirmation is rejected', async () => {
    mockConfirm.mockResolvedValue(false);

    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890'], { from: 'user' });

    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  it('should skip confirmation when --force is specified', async () => {
    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890', '--force'], { from: 'user' });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDeleteExecute).toHaveBeenCalledWith('c1b2a3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('should set process.exitCode = 1 when cluster not found', async () => {
    mockFindById.mockResolvedValue(null);
    mockFindBySlug.mockResolvedValue(null);

    const cmd = createDelCommand();
    await cmd.parseAsync(['nonexistent'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  it('should set process.exitCode = 1 when delete returns error', async () => {
    mockDeleteExecute.mockResolvedValue({ ok: false, error: 'Destroy failed' });

    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890', '--force'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('should set process.exitCode = 1 on exception', async () => {
    mockDeleteExecute.mockRejectedValue(new Error('DB connection failed'));

    const cmd = createDelCommand();
    await cmd.parseAsync(['c1b2a3d4-e5f6-7890-abcd-ef1234567890', '--force'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
