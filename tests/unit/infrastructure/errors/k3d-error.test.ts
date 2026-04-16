import { describe, it, expect } from 'vitest';
import { K3dError, K3dErrorCode } from '@/infrastructure/errors/k3d-error.js';

describe('K3dError', () => {
  it('should have correct name, code, and message', () => {
    const error = new K3dError('k3d not found', K3dErrorCode.BINARY_NOT_FOUND);
    expect(error.name).toBe('K3dError');
    expect(error.code).toBe(K3dErrorCode.BINARY_NOT_FOUND);
    expect(error.message).toBe('k3d not found');
    expect(error).toBeInstanceOf(Error);
  });

  it('should preserve cause when provided', () => {
    const cause = new Error('ENOENT');
    const error = new K3dError('k3d binary missing', K3dErrorCode.BINARY_NOT_FOUND, cause);
    expect(error.cause).toBe(cause);
  });

  it('should have undefined cause when not provided', () => {
    const error = new K3dError('cluster exists', K3dErrorCode.CLUSTER_EXISTS);
    expect(error.cause).toBeUndefined();
  });

  it('should support all error codes', () => {
    expect(K3dErrorCode.BINARY_NOT_FOUND).toBe('BINARY_NOT_FOUND');
    expect(K3dErrorCode.CLUSTER_EXISTS).toBe('CLUSTER_EXISTS');
    expect(K3dErrorCode.CLUSTER_NOT_FOUND).toBe('CLUSTER_NOT_FOUND');
    expect(K3dErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED');
    expect(K3dErrorCode.TIMEOUT).toBe('TIMEOUT');
  });
});
