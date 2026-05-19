/**
 * Application Not Found Error
 *
 * Thrown by ASPM use cases (e.g. {@link GetApplicationPostureUseCase})
 * when an Application lookup by id does not find a matching record.
 */
export class ApplicationNotFoundError extends Error {
  readonly code = 'ASPM_APPLICATION_NOT_FOUND';
  constructor(public readonly applicationId: string) {
    super(`Application ${applicationId} not found`);
    this.name = 'ApplicationNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
