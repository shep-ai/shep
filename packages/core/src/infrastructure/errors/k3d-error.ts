/**
 * K3d Error
 *
 * Typed error for k3d CLI operations with error codes for
 * programmatic error handling.
 */

export enum K3dErrorCode {
  BINARY_NOT_FOUND = 'BINARY_NOT_FOUND',
  CLUSTER_EXISTS = 'CLUSTER_EXISTS',
  CLUSTER_NOT_FOUND = 'CLUSTER_NOT_FOUND',
  COMMAND_FAILED = 'COMMAND_FAILED',
  TIMEOUT = 'TIMEOUT',
}

export class K3dError extends Error {
  constructor(
    message: string,
    public readonly code: K3dErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'K3dError';
  }
}
