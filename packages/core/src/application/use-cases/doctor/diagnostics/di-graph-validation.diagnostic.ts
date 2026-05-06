/**
 * DiGraphValidationDiagnostic
 *
 * Walks a curated set of critical DI tokens and verifies each one is
 * registered in the container. Catches the common "I added a port but
 * forgot to wire it in `register-services.ts`" failure mode early — a
 * green doctor here means the rest of Shep can at least bootstrap.
 *
 * Receives a `tokenChecker` so the application layer never imports the
 * tsyringe container directly; the runner injects a closure that reads
 * the global container in infrastructure.
 */

import { injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';

export type IsRegisteredFn = (token: string) => boolean;

const REQUIRED_TOKENS: readonly string[] = [
  'IFileSystemService',
  'IGitPrService',
  'IGitHubRepositoryService',
  'IAgentAuthDetectorService',
  'IDiagnosticRunner',
  'ISettingsProvider',
  'Database',
];

@injectable()
export class DiGraphValidationDiagnostic implements IDiagnostic {
  readonly name = 'di-graph-validation';

  constructor(
    private readonly isRegistered: IsRegisteredFn,
    private readonly tokens: readonly string[] = REQUIRED_TOKENS
  ) {}

  async run(): Promise<DiagnosticResult> {
    const missing = this.tokens.filter((token) => !this.isRegistered(token));
    if (missing.length > 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Missing DI registrations: ${missing.join(', ')}`,
        fixHint: 'Wire the missing token(s) in `infrastructure/di/modules/`',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `All ${this.tokens.length} critical DI tokens are registered`,
    };
  }
}
