/**
 * Create Terminal Session Use Case
 *
 * Opens a new interactive PTY session rooted at an application's working
 * directory (or any caller-supplied cwd). Returns an opaque session id
 * that presentation layers use for subsequent input/output/resize calls.
 *
 * Also enriches the spawn env with integration credentials when configured
 * (e.g. GH_TOKEN / GITHUB_TOKEN from the GitHub integration) so tools like
 * `gh` and `git push https://...` authenticate without the user having to
 * paste tokens into the terminal.
 */

import { inject, injectable } from 'tsyringe';
import type {
  CreatedTerminalSession,
  ITerminalSessionService,
} from '../../ports/output/services/terminal-session-service.interface.js';
import type { IGithubIntegrationRepository } from '../../ports/output/repositories/github-integration.repository.interface.js';

export interface CreateTerminalSessionCommand {
  cwd: string;
  cols?: number;
  rows?: number;
}

@injectable()
export class CreateTerminalSessionUseCase {
  constructor(
    @inject('ITerminalSessionService')
    private readonly terminals: ITerminalSessionService,
    @inject('IGithubIntegrationRepository')
    private readonly github: IGithubIntegrationRepository
  ) {}

  async execute(command: CreateTerminalSessionCommand): Promise<CreatedTerminalSession> {
    if (!command.cwd || command.cwd.trim().length === 0) {
      throw new Error('cwd is required to create a terminal session');
    }
    const extraEnv: Record<string, string> = {};
    const ghToken = await this.github.get().catch(() => null);
    if (ghToken) {
      // Both names are honored by gh CLI and many other tools; setting both
      // covers `gh`, `hub`, `git -c credential.helper=...`, and anything
      // else that reads the standard env.
      extraEnv.GH_TOKEN = ghToken;
      extraEnv.GITHUB_TOKEN = ghToken;
    }
    return this.terminals.create({
      cwd: command.cwd,
      cols: command.cols,
      rows: command.rows,
      extraEnv,
    });
  }
}
