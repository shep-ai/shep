/**
 * GhCliAuthDiagnostic
 *
 * Verifies the GitHub CLI (`gh`) is installed and authenticated. Many Shep
 * surfaces (issue grooming, PR sync, IGitHubIssueWriter) reuse the token
 * resolved by `gh auth`, so a missing or unauthenticated `gh` blocks the
 * contributor automation pipeline.
 */

import { inject, injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import {
  GitHubAuthError,
  type IGitHubRepositoryService,
} from '../../../ports/output/services/github-repository-service.interface.js';

@injectable()
export class GhCliAuthDiagnostic implements IDiagnostic {
  readonly name = 'gh-cli-auth';

  constructor(
    @inject('IGitHubRepositoryService')
    private readonly githubService: IGitHubRepositoryService
  ) {}

  async run(): Promise<DiagnosticResult> {
    try {
      await this.githubService.checkAuth();
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: 'gh CLI is authenticated',
      };
    } catch (err) {
      const isAuthError = err instanceof GitHubAuthError;
      return {
        name: this.name,
        status: isAuthError ? DiagnosticStatus.Warn : DiagnosticStatus.Fail,
        detail: isAuthError
          ? 'gh CLI is not authenticated'
          : `gh auth check failed: ${err instanceof Error ? err.message : String(err)}`,
        fixHint: 'Run `gh auth login` to authenticate the GitHub CLI',
      };
    }
  }
}
