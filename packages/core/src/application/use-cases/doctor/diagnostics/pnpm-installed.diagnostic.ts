/**
 * PnpmInstalledDiagnostic
 *
 * Confirms `pnpm` is on PATH and reports its version. Shep is a pnpm
 * workspace; the dev experience falls apart without it.
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
export class PnpmInstalledDiagnostic implements IDiagnostic {
  readonly name = 'pnpm-installed';

  constructor(private readonly run_: CommandRunner = runCommand) {}

  async run(): Promise<DiagnosticResult> {
    const result = await this.run_('pnpm', ['--version']);
    if (result.notFound) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: 'pnpm is not installed (not on PATH)',
        fixHint: 'Install pnpm: `corepack enable` or `npm install -g pnpm`',
      };
    }
    if (result.exitCode !== 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `pnpm exited with code ${result.exitCode}: ${result.stderr || 'no output'}`,
        fixHint: 'Re-install pnpm or check `pnpm --version` manually',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `pnpm ${result.stdout || '(version unknown)'}`,
    };
  }
}
