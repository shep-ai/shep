/**
 * Docker Error
 *
 * Typed error for Docker daemon operations with error codes for
 * programmatic error handling.
 */

export enum DockerErrorCode {
  DAEMON_NOT_RUNNING = 'DAEMON_NOT_RUNNING',
  BINARY_NOT_FOUND = 'BINARY_NOT_FOUND',
}

export class DockerError extends Error {
  constructor(
    message: string,
    public readonly code: DockerErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DockerError';
  }
}
