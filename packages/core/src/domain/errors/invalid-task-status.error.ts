/**
 * Invalid Task Status Error
 *
 * Thrown by UpdateSdlcTaskStatusUseCase and UpdateSdlcSubTaskStatusUseCase
 * when a caller supplies a status string that is not a member of TaskState.
 */
export class InvalidTaskStatusError extends Error {
  constructor(status: string) {
    super(`Invalid task status: "${status}"`);
    this.name = 'InvalidTaskStatusError';
    // Maintain proper prototype chain in TypeScript/ES5 targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
