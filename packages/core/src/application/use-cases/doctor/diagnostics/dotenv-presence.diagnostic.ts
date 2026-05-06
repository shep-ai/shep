/**
 * DotenvPresenceDiagnostic
 *
 * Checks whether a `.env` file exists at the workspace root. Several Shep
 * adapters (Discord outreach, agent providers, optional GitHub tokens)
 * read configuration from `.env`; absence is informational, not fatal —
 * many setups inject env vars another way — so the diagnostic warns
 * rather than fails.
 */

import { inject, injectable } from 'tsyringe';
import path from 'node:path';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IFileSystemService } from '../../../ports/output/services/file-system-service.interface.js';

@injectable()
export class DotenvPresenceDiagnostic implements IDiagnostic {
  readonly name = 'dotenv-presence';

  constructor(
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    private readonly workspaceRoot: string = process.cwd()
  ) {}

  async run(): Promise<DiagnosticResult> {
    const dotenvPath = path.join(this.workspaceRoot, '.env');
    const exists = this.fileSystem.pathExists(dotenvPath);
    if (!exists) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: 'No .env file at the workspace root',
        fixHint:
          'Copy `.env.example` to `.env` if your setup needs Discord / GitHub tokens or local overrides',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: '.env file is present at the workspace root',
    };
  }
}
