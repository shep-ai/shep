/**
 * Owner Orphaned Finding Error
 *
 * Thrown by ASPM ownership use cases when removing or deleting an
 * Owner would leave one or more SecurityFinding rows without a
 * resolvable owner. Callers must reassign affected findings first.
 */
export class OwnerOrphanedFindingError extends Error {
  readonly code = 'ASPM_OWNER_ORPHANED_FINDING';
  constructor(
    public readonly ownerId: string,
    public readonly findingCount: number
  ) {
    super(
      `Cannot remove owner ${ownerId}: ${findingCount} finding(s) would be orphaned; reassign them first`
    );
    this.name = 'OwnerOrphanedFindingError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
