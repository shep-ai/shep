/**
 * Application Not Found Error
 *
 * Thrown by application use cases when an application lookup by id
 * does not find a matching record in the repository.
 */
export class ApplicationNotFoundError extends Error {
  readonly code = 'APPLICATION_NOT_FOUND';
  constructor(public readonly applicationId: string) {
    super(`Application ${applicationId} not found`);
    this.name = 'ApplicationNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
