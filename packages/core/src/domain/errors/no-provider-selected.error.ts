/**
 * No Provider Selected Error
 *
 * Thrown when an application deployment is requested but no cloud deployment
 * provider has been selected on the application and none was supplied to the
 * use case input.
 */
export class NoProviderSelectedError extends Error {
  readonly code = 'NO_PROVIDER_SELECTED';
  constructor(public readonly applicationId: string) {
    super(`Application ${applicationId} has no cloud deployment provider selected`);
    this.name = 'NoProviderSelectedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
