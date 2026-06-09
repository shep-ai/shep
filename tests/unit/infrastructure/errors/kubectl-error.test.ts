import { describe, it, expect } from 'vitest';
import { KubectlError, KubectlErrorCode } from '@/infrastructure/errors/kubectl-error.js';

describe('KubectlError', () => {
  it('should have correct name, code, and message', () => {
    const error = new KubectlError('kubectl not found', KubectlErrorCode.BINARY_NOT_FOUND);
    expect(error.name).toBe('KubectlError');
    expect(error.code).toBe(KubectlErrorCode.BINARY_NOT_FOUND);
    expect(error.message).toBe('kubectl not found');
    expect(error).toBeInstanceOf(Error);
  });

  it('should preserve cause when provided', () => {
    const cause = new Error('ENOENT');
    const error = new KubectlError(
      'kubectl binary missing',
      KubectlErrorCode.BINARY_NOT_FOUND,
      cause
    );
    expect(error.cause).toBe(cause);
  });

  it('should have undefined cause when not provided', () => {
    const error = new KubectlError('apply failed', KubectlErrorCode.APPLY_FAILED);
    expect(error.cause).toBeUndefined();
  });

  it('should support all error codes', () => {
    expect(KubectlErrorCode.BINARY_NOT_FOUND).toBe('BINARY_NOT_FOUND');
    expect(KubectlErrorCode.APPLY_FAILED).toBe('APPLY_FAILED');
    expect(KubectlErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    expect(KubectlErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED');
    expect(KubectlErrorCode.TIMEOUT).toBe('TIMEOUT');
  });
});
