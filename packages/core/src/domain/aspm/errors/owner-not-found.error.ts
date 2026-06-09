/**
 * Owner Not Found Error
 *
 * Thrown by ASPM ownership use cases when an Owner lookup by id does not
 * find a matching record in the repository.
 */
export class OwnerNotFoundError extends Error {
  readonly code = 'ASPM_OWNER_NOT_FOUND';
  constructor(public readonly ownerId: string) {
    super(`Owner ${ownerId} not found`);
    this.name = 'OwnerNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
