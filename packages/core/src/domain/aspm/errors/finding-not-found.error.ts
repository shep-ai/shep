/**
 * Finding Not Found Error
 *
 * Thrown by ASPM use cases when a SecurityFinding lookup by id does
 * not find a matching record in the repository.
 */
export class FindingNotFoundError extends Error {
  readonly code = 'ASPM_FINDING_NOT_FOUND';
  constructor(public readonly findingId: string) {
    super(`Finding ${findingId} not found`);
    this.name = 'FindingNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
