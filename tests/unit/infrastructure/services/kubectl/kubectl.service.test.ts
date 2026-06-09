/**
 * KubectlService Unit Tests
 *
 * Tests for kubectl CLI wrapper service.
 * Uses constructor-injected exec function mock.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KubectlService } from '@/infrastructure/services/kubectl/kubectl.service.js';
import { KubectlError, KubectlErrorCode } from '@/infrastructure/errors/kubectl-error.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('KubectlService', () => {
  let service: KubectlService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  const kubeconfigPath = '/tmp/kubeconfig';

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    service = new KubectlService(mockExecFile);
  });

  describe('apply', () => {
    it('should call kubectl apply with manifest path and kubeconfig', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.apply(kubeconfigPath, '/tmp/manifest.yaml');

      expect(mockExecFile).toHaveBeenCalledWith('kubectl', [
        'apply',
        '-f',
        '/tmp/manifest.yaml',
        '--kubeconfig',
        kubeconfigPath,
      ]);
    });

    it('should throw KubectlError with BINARY_NOT_FOUND for ENOENT', async () => {
      const error = new Error('spawn kubectl ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.apply(kubeconfigPath, '/tmp/manifest.yaml');
      await expect(rejection).rejects.toThrow(KubectlError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(service.apply(kubeconfigPath, '/tmp/manifest.yaml')).rejects.toMatchObject({
        code: KubectlErrorCode.BINARY_NOT_FOUND,
      });
    });

    it('should throw KubectlError with APPLY_FAILED on apply error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('error when applying'));

      const rejection = service.apply(kubeconfigPath, '/tmp/manifest.yaml');
      await expect(rejection).rejects.toThrow(KubectlError);

      mockExecFile.mockRejectedValueOnce(new Error('error when applying'));
      await expect(service.apply(kubeconfigPath, '/tmp/manifest.yaml')).rejects.toMatchObject({
        code: KubectlErrorCode.APPLY_FAILED,
      });
    });
  });

  describe('applyStdin', () => {
    it('should call kubectl apply with stdin and kubeconfig', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      const yaml = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test';

      await service.applyStdin(kubeconfigPath, yaml);

      expect(mockExecFile).toHaveBeenCalledWith(
        'kubectl',
        ['apply', '-f', '-', '--kubeconfig', kubeconfigPath],
        { input: yaml }
      );
    });
  });

  describe('getNamespaces', () => {
    it('should parse namespace list from JSON', async () => {
      const response = {
        items: [{ metadata: { name: 'default' } }, { metadata: { name: 'kube-system' } }],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const namespaces = await service.getNamespaces(kubeconfigPath);

      expect(namespaces).toEqual(['default', 'kube-system']);
      expect(mockExecFile).toHaveBeenCalledWith('kubectl', [
        'get',
        'namespaces',
        '-o',
        'json',
        '--kubeconfig',
        kubeconfigPath,
      ]);
    });
  });

  describe('getPods', () => {
    it('should parse pod list from JSON', async () => {
      const response = {
        items: [
          {
            metadata: { name: 'nginx-abc123', namespace: 'default' },
            status: {
              phase: 'Running',
              containerStatuses: [{ ready: true }],
            },
          },
          {
            metadata: { name: 'init-pod', namespace: 'default' },
            status: {
              phase: 'Pending',
              containerStatuses: [{ ready: false }],
            },
          },
        ],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const pods = await service.getPods(kubeconfigPath, 'default');

      expect(pods).toEqual([
        { name: 'nginx-abc123', namespace: 'default', status: 'Running', ready: true },
        { name: 'init-pod', namespace: 'default', status: 'Pending', ready: false },
      ]);
    });

    it('should default to "default" namespace when not specified', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '{"items":[]}', stderr: '' });

      await service.getPods(kubeconfigPath);

      expect(mockExecFile).toHaveBeenCalledWith('kubectl', [
        'get',
        'pods',
        '-n',
        'default',
        '-o',
        'json',
        '--kubeconfig',
        kubeconfigPath,
      ]);
    });

    it('should handle pods without containerStatuses', async () => {
      const response = {
        items: [
          {
            metadata: { name: 'pending-pod', namespace: 'default' },
            status: { phase: 'Pending' },
          },
        ],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const pods = await service.getPods(kubeconfigPath);

      expect(pods[0].ready).toBe(false);
    });
  });

  describe('getServices', () => {
    it('should parse service list from JSON', async () => {
      const response = {
        items: [
          {
            metadata: { name: 'kubernetes', namespace: 'default' },
            spec: {
              type: 'ClusterIP',
              clusterIP: '10.43.0.1',
              ports: [{ port: 443, targetPort: 6443, protocol: 'TCP' }],
            },
          },
        ],
      };
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(response), stderr: '' });

      const services = await service.getServices(kubeconfigPath);

      expect(services).toEqual([
        {
          name: 'kubernetes',
          namespace: 'default',
          type: 'ClusterIP',
          clusterIp: '10.43.0.1',
          ports: '443/TCP',
        },
      ]);
    });
  });

  describe('waitForReady', () => {
    it('should call kubectl wait with correct args', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.waitForReady(kubeconfigPath, 'node/k3d-test-server-0', 120);

      expect(mockExecFile).toHaveBeenCalledWith('kubectl', [
        'wait',
        '--for=condition=Ready',
        'node/k3d-test-server-0',
        '--timeout',
        '120s',
        '--kubeconfig',
        kubeconfigPath,
      ]);
    });

    it('should throw KubectlError with TIMEOUT when kubectl wait times out', async () => {
      const error = new Error('error: timed out waiting for the condition');
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.waitForReady(kubeconfigPath, 'node/k3d-test-server-0', 30);
      await expect(rejection).rejects.toThrow(KubectlError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(
        service.waitForReady(kubeconfigPath, 'node/k3d-test-server-0', 30)
      ).rejects.toMatchObject({
        code: KubectlErrorCode.TIMEOUT,
      });
    });

    it('should throw KubectlError with COMMAND_FAILED on other errors', async () => {
      const error = new Error('some other error');
      mockExecFile.mockRejectedValueOnce(error);

      const rejection = service.waitForReady(kubeconfigPath, 'node/k3d-test-server-0', 30);
      await expect(rejection).rejects.toThrow(KubectlError);

      mockExecFile.mockRejectedValueOnce(error);
      await expect(
        service.waitForReady(kubeconfigPath, 'node/k3d-test-server-0', 30)
      ).rejects.toMatchObject({
        code: KubectlErrorCode.COMMAND_FAILED,
      });
    });
  });
});
