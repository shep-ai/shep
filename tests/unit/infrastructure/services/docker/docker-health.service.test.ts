/**
 * DockerHealthService Unit Tests
 *
 * Tests for Docker daemon health checking.
 * Uses constructor-injected exec function mock.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerHealthService } from '@/infrastructure/services/docker/docker-health.service.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('DockerHealthService', () => {
  let service: DockerHealthService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    service = new DockerHealthService(mockExecFile);
  });

  describe('isAvailable', () => {
    it('should return true when docker info succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'Docker info output', stderr: '' });

      const result = await service.isAvailable();

      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['info']);
    });

    it('should return false when docker binary is not found (ENOENT)', async () => {
      const error = new Error('spawn docker ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(error);

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when docker daemon is not running', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('Cannot connect to the Docker daemon'));

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false on any other error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('permission denied'));

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });
});
