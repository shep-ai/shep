/**
 * K3dService Unit Tests
 *
 * Tests for k3d CLI wrapper service.
 * Uses constructor-injected exec function mock.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { K3dService } from '@/infrastructure/services/k3d/k3d.service.js';
import { K3dError, K3dErrorCode } from '@/infrastructure/errors/k3d-error.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('K3dService', () => {
  let service: K3dService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    service = new K3dService(mockExecFile);
  });

  describe('createCluster', () => {
    it('should call k3d cluster create with --no-lb and --wait by default', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.createCluster('test-cluster');

      expect(mockExecFile).toHaveBeenCalledWith('k3d', [
        'cluster',
        'create',
        'test-cluster',
        '--no-lb',
        '--wait',
      ]);
    });

    it('should include timeout flag when specified', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.createCluster('test-cluster', { timeoutSeconds: 120 });

      expect(mockExecFile).toHaveBeenCalledWith('k3d', [
        'cluster',
        'create',
        'test-cluster',
        '--no-lb',
        '--wait',
        '--timeout',
        '120s',
      ]);
    });

    it('should throw K3dError with BINARY_NOT_FOUND when k3d is missing', async () => {
      const error = new Error('spawn k3d ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.createCluster('test-cluster');
      await expect(rejection).rejects.toThrow(K3dError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(service.createCluster('test-cluster')).rejects.toMatchObject({
        code: K3dErrorCode.BINARY_NOT_FOUND,
      });
    });

    it('should throw K3dError with CLUSTER_EXISTS when cluster already exists', async () => {
      const error = new Error('cluster already exists') as Error & { stderr: string };
      error.stderr = 'FATA[0000] Failed to create cluster: cluster already exists';
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.createCluster('test-cluster');
      await expect(rejection).rejects.toThrow(K3dError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(service.createCluster('test-cluster')).rejects.toMatchObject({
        code: K3dErrorCode.CLUSTER_EXISTS,
      });
    });
  });

  describe('deleteCluster', () => {
    it('should call k3d cluster delete', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.deleteCluster('test-cluster');

      expect(mockExecFile).toHaveBeenCalledWith('k3d', ['cluster', 'delete', 'test-cluster']);
    });

    it('should throw K3dError with CLUSTER_NOT_FOUND when cluster does not exist', async () => {
      const error = new Error('cluster not found');
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.deleteCluster('missing');
      await expect(rejection).rejects.toThrow(K3dError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(service.deleteCluster('missing')).rejects.toMatchObject({
        code: K3dErrorCode.CLUSTER_NOT_FOUND,
      });
    });
  });

  describe('startCluster', () => {
    it('should call k3d cluster start', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.startCluster('test-cluster');

      expect(mockExecFile).toHaveBeenCalledWith('k3d', ['cluster', 'start', 'test-cluster']);
    });
  });

  describe('stopCluster', () => {
    it('should call k3d cluster stop', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.stopCluster('test-cluster');

      expect(mockExecFile).toHaveBeenCalledWith('k3d', ['cluster', 'stop', 'test-cluster']);
    });
  });

  describe('getClusterStatus', () => {
    it('should parse cluster list JSON and return status', async () => {
      const clusters = [
        { name: 'test-cluster', serversRunning: 1, serversCount: 1 },
        { name: 'other-cluster', serversRunning: 0, serversCount: 1 },
      ];
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(clusters), stderr: '' });

      const status = await service.getClusterStatus('test-cluster');

      expect(status).toEqual({
        exists: true,
        running: true,
        serverCount: 1,
      });
    });

    it('should return null when cluster is not in list', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      const status = await service.getClusterStatus('missing');

      expect(status).toBeNull();
    });

    it('should return null on non-ENOENT errors', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('some error'));

      const status = await service.getClusterStatus('test-cluster');

      expect(status).toBeNull();
    });

    it('should throw K3dError with BINARY_NOT_FOUND for ENOENT', async () => {
      const error = new Error('spawn k3d ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.getClusterStatus('test-cluster');
      await expect(rejection).rejects.toThrow(K3dError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(service.getClusterStatus('test-cluster')).rejects.toMatchObject({
        code: K3dErrorCode.BINARY_NOT_FOUND,
      });
    });
  });

  describe('getKubeconfig', () => {
    it('should return kubeconfig content from stdout', async () => {
      const kubeconfig = 'apiVersion: v1\nkind: Config\nclusters: []';
      mockExecFile.mockResolvedValueOnce({ stdout: kubeconfig, stderr: '' });

      const result = await service.getKubeconfig('test-cluster');

      expect(result).toBe(kubeconfig);
      expect(mockExecFile).toHaveBeenCalledWith('k3d', ['kubeconfig', 'get', 'test-cluster']);
    });

    it('should throw K3dError on failure', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('cluster not found'));

      await expect(service.getKubeconfig('missing')).rejects.toThrow(K3dError);
    });
  });
});
