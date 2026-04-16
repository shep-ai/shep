import { describe, it, expect } from 'vitest';
import { DockerError, DockerErrorCode } from '@/infrastructure/errors/docker-error.js';

describe('DockerError', () => {
  it('should have correct name, code, and message', () => {
    const error = new DockerError('Docker not running', DockerErrorCode.DAEMON_NOT_RUNNING);
    expect(error.name).toBe('DockerError');
    expect(error.code).toBe(DockerErrorCode.DAEMON_NOT_RUNNING);
    expect(error.message).toBe('Docker not running');
    expect(error).toBeInstanceOf(Error);
  });

  it('should preserve cause when provided', () => {
    const cause = new Error('connection refused');
    const error = new DockerError('daemon down', DockerErrorCode.DAEMON_NOT_RUNNING, cause);
    expect(error.cause).toBe(cause);
  });

  it('should have undefined cause when not provided', () => {
    const error = new DockerError('no docker', DockerErrorCode.BINARY_NOT_FOUND);
    expect(error.cause).toBeUndefined();
  });

  it('should support all error codes', () => {
    expect(DockerErrorCode.DAEMON_NOT_RUNNING).toBe('DAEMON_NOT_RUNNING');
    expect(DockerErrorCode.BINARY_NOT_FOUND).toBe('BINARY_NOT_FOUND');
  });
});
