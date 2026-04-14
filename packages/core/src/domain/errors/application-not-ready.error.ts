/**
 * Application Not Ready Error
 *
 * Thrown by deployment use cases when the application has not yet completed
 * its initial setup (scaffolding, dependency install, first build).
 */
export class ApplicationNotReadyError extends Error {
  readonly code = 'APPLICATION_NOT_READY';
  constructor(public readonly applicationId: string) {
    super(`Application ${applicationId} has not completed setup yet — cannot deploy`);
    this.name = 'ApplicationNotReadyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
