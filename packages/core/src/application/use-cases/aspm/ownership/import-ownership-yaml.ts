/**
 * ImportOwnershipYamlUseCase (feature 098, phase 2).
 *
 * Reads `.shep/ownership.yaml` from the Application's repository path via
 * IOwnershipYamlReader. The YAML references existing Owner / Team /
 * BusinessUnit UUIDs — this use case does not create those rows (a
 * separate workflow does). It returns the parsed entries plus a count
 * so the CLI / UI can surface "N ownership rules imported".
 *
 * Resolving the effective owner for a path lives in the pure-domain
 * resolveOwnership function; this use case is the wiring between the
 * Application's repository_path and the reader port.
 */

import { inject, injectable } from 'tsyringe';
import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import type {
  OwnershipYaml,
  OwnershipYamlEntry,
} from '../../../../domain/aspm/ownership/resolve-ownership.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IOwnershipYamlReader } from '../../../ports/output/services/ownership-yaml-reader.interface.js';

export interface ImportOwnershipYamlInput {
  applicationId: string;
}

export interface ImportOwnershipYamlResult {
  entries: OwnershipYamlEntry[];
  count: number;
  document: OwnershipYaml;
}

@injectable()
export class ImportOwnershipYamlUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IOwnershipYamlReader') private readonly reader: IOwnershipYamlReader
  ) {}

  async execute(input: ImportOwnershipYamlInput): Promise<ImportOwnershipYamlResult> {
    const app = await this.appRepo.findById(input.applicationId);
    if (app === null) throw new ApplicationNotFoundError(input.applicationId);
    const document = await this.reader.read(app.repositoryPath);
    return {
      document,
      entries: document.entries,
      count: document.entries.length,
    };
  }
}
