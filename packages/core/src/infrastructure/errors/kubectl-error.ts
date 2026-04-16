/**
 * Kubectl Error
 *
 * Typed error for kubectl CLI operations with error codes for
 * programmatic error handling.
 */

export enum KubectlErrorCode {
  BINARY_NOT_FOUND = 'BINARY_NOT_FOUND',
  APPLY_FAILED = 'APPLY_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  COMMAND_FAILED = 'COMMAND_FAILED',
  TIMEOUT = 'TIMEOUT',
}

export class KubectlError extends Error {
  constructor(
    message: string,
    public readonly code: KubectlErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'KubectlError';
  }
}
