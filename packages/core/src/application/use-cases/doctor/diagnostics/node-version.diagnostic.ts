/**
 * NodeVersionDiagnostic
 *
 * Verifies that the Node.js runtime executing `shep doctor` is at or above
 * the project's minimum supported major version (Shep requires Node 22+).
 * Reads `process.version` directly — no subprocess needed.
 */

import { injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';

const MIN_NODE_MAJOR = 22;

@injectable()
export class NodeVersionDiagnostic implements IDiagnostic {
  readonly name = 'node-version';

  constructor(private readonly versionString: string = process.version) {}

  async run(): Promise<DiagnosticResult> {
    const major = parseMajor(this.versionString);
    if (major === null) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Could not parse Node version "${this.versionString}"`,
        fixHint: `Ensure Node ${MIN_NODE_MAJOR}+ is installed and on PATH`,
      };
    }
    if (major < MIN_NODE_MAJOR) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: `Node ${this.versionString} is below the required v${MIN_NODE_MAJOR}+`,
        fixHint: `Install Node ${MIN_NODE_MAJOR} or newer (see .nvmrc); recommended via nvm or fnm`,
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `Node ${this.versionString} (>= v${MIN_NODE_MAJOR})`,
    };
  }
}

function parseMajor(versionString: string): number | null {
  const m = /^v?(\d+)\./.exec(versionString.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
