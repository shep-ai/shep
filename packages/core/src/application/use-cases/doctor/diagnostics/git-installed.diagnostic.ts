/**
 * GitInstalledDiagnostic
 *
 * Confirms `git` is on PATH and reports its version. Shep clones, branches,
 * commits, and pushes through the local git binary — without it nothing
 * past `shep doctor` itself works.
 */

import { injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import { runCommand, type RunCommandResult } from './run-command.js';

type CommandRunner = (binary: string, args: readonly string[]) => Promise<RunCommandResult>;

@injectable()
export class GitInstalledDiagnostic implements IDiagnostic {
  readonly name = 'git-installed';

  constructor(private readonly run_: CommandRunner = runCommand) {}

  async run(): Promise<DiagnosticResult> {
    const result = await this.run_('git', ['--version']);
    if (result.notFound) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: 'git is not installed (not on PATH)',
        fixHint:
          'Install git: macOS `xcode-select --install`, Linux `apt install git`, Windows `winget install --id Git.Git`',
      };
    }
    if (result.exitCode !== 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `git exited with code ${result.exitCode}: ${result.stderr || 'no output'}`,
        fixHint: 'Re-install git or run `git --version` manually to investigate',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: result.stdout || 'git installed (version unknown)',
    };
  }
}
