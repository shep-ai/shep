/**
 * Exception Already Active Error
 *
 * Thrown by declare-exception when the caller attempts to declare a fresh
 * RiskException on a finding that already has an Active one in flight.
 * Callers must explicitly revoke the existing exception first (FR-23).
 */
export class ExceptionAlreadyActiveError extends Error {
  readonly code = 'ASPM_EXCEPTION_ALREADY_ACTIVE';
  constructor(
    public readonly findingId: string,
    public readonly existingExceptionId: string
  ) {
    super(
      `Finding ${findingId} already has an Active exception ${existingExceptionId} — revoke it before declaring a new one`
    );
    this.name = 'ExceptionAlreadyActiveError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
