/**
 * IOwnershipYamlReader (Output Port) — feature 098, phase 2.
 *
 * Reads the optional `.shep/ownership.yaml` document from an Application's
 * repository and returns a typed ownership document. Implementations live
 * in infrastructure/services/aspm and are wired via register-aspm.ts.
 *
 * Document shape (informal):
 *
 *   entries:
 *     - pathGlob: "src/api/**"
 *       ownerId:  "owner-uuid"
 *       teamId:   "team-uuid"            # optional
 *       businessUnitId: "bu-uuid"        # optional
 *
 * Missing file: implementations MUST return `{ entries: [] }` instead of
 * throwing — ownership is optional, and the resolver falls back to the
 * Application's listed owner.
 *
 * Pure-domain ownership resolution is performed by
 * `domain/aspm/ownership/resolve-ownership.ts`; this port only deals with
 * file IO + YAML parsing.
 */

import type { OwnershipYaml } from '../../../../domain/aspm/ownership/resolve-ownership.js';

export interface IOwnershipYamlReader {
  /**
   * Read and parse `.shep/ownership.yaml` from the given repository root.
   *
   * @param repositoryPath absolute path to the application's repository
   *                       root. Implementations normalize path separators
   *                       before joining.
   * @returns parsed ownership document, or `{ entries: [] }` when the file
   *          is missing.
   */
  read(repositoryPath: string): Promise<OwnershipYaml>;
}
