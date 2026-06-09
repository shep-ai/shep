/**
 * Exception Expired Error
 *
 * Thrown by ASPM exception use cases when a caller attempts to act
 * on a RiskException whose expiry has already passed. Expired
 * exceptions are read-only — callers must declare a fresh exception
 * or revoke explicitly.
 */
export class ExceptionExpiredError extends Error {
  readonly code = 'ASPM_EXCEPTION_EXPIRED';
  constructor(
    public readonly exceptionId: string,
    public readonly expiresAt: string
  ) {
    super(`Exception ${exceptionId} expired at ${expiresAt} and is no longer mutable`);
    this.name = 'ExceptionExpiredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
