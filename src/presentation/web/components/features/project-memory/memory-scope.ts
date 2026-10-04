import { MemoryScope } from '@shepai/core/domain/generated/output';

/** A Space-scoped or legacy Organization entry is shared with its whole space. */
export function isSpaceWideScope(scope: MemoryScope | undefined): boolean {
  return scope === MemoryScope.Space || scope === MemoryScope.Organization;
}

/** The scope the menu shows as selected; legacy Organization reads as Space. */
export function effectiveScope(scope: MemoryScope | undefined): MemoryScope {
  if (isSpaceWideScope(scope)) return MemoryScope.Space;
  return scope ?? MemoryScope.Project;
}
