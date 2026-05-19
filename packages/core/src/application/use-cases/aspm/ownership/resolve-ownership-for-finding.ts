/**
 * ResolveOwnershipForFindingUseCase (feature 098, phase 2).
 *
 * Application-layer wrapper around the pure-domain resolveOwnership
 * function. Composes the inputs the resolver needs:
 *
 *   - Application's listed owner (fallback) — looked up by id
 *   - .shep/ownership.yaml — read via IOwnershipYamlReader
 *   - Optional UI override (highest priority) — passed in by the caller
 *
 * On no-resolution, throws OwnerOrphanedFindingError so callers (e.g. the
 * Finding ingest flow in phase 3) get a typed signal instead of having
 * to branch on a null sentinel.
 *
 * Note: Application doesn't carry an ownerId column today; the
 * applicationOwnerId fallback is reserved as a hook for a follow-up
 * migration. Today the resolver falls through to "no resolution" if YAML
 * and UI override both miss.
 */

import { inject, injectable } from 'tsyringe';
import {
  resolveOwnership,
  type OwnershipResolutionResult,
} from '../../../../domain/aspm/ownership/resolve-ownership.js';
import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import { OwnerOrphanedFindingError } from '../../../../domain/aspm/errors/owner-orphaned-finding.error.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IOwnerRepository } from '../../../ports/output/repositories/owner-repository.interface.js';
import type { IOwnershipYamlReader } from '../../../ports/output/services/ownership-yaml-reader.interface.js';

export interface ResolveOwnershipForFindingInput {
  applicationId: string;
  /** Repo-relative path of the asset/finding location. */
  assetPath: string;
  /** Optional UI override (highest priority). */
  uiOverrideOwnerId?: string;
}

@injectable()
export class ResolveOwnershipForFindingUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IOwnerRepository') private readonly ownerRepo: IOwnerRepository,
    @inject('IOwnershipYamlReader') private readonly reader: IOwnershipYamlReader
  ) {}

  async execute(input: ResolveOwnershipForFindingInput): Promise<OwnershipResolutionResult> {
    const app = await this.appRepo.findById(input.applicationId);
    if (app === null) throw new ApplicationNotFoundError(input.applicationId);

    const ownershipYaml = await this.reader.read(app.repositoryPath);

    const resolved = resolveOwnership({
      assetPath: input.assetPath,
      uiOverrideOwnerId: input.uiOverrideOwnerId,
      ownershipYaml,
      applicationOwnerId: undefined,
    });

    if (resolved === null) throw new OwnerOrphanedFindingError(input.applicationId, 1);

    const ownerExists = await this.ownerRepo.findById(resolved.ownerId);
    if (ownerExists === null) throw new OwnerOrphanedFindingError(resolved.ownerId, 1);

    return resolved;
  }
}
