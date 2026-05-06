/**
 * TypespecFreshnessDiagnostic
 *
 * Compares the most-recently-edited `.tsp` source under `tsp/` against the
 * generated `domain/generated/output.ts`. If a TypeSpec source is newer
 * than the generated file, the contributor likely forgot to run
 * `pnpm tsp:compile` and downstream type errors are imminent.
 */

import { inject, injectable } from 'tsyringe';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IFileSystemService } from '../../../ports/output/services/file-system-service.interface.js';

const GENERATED_RELATIVE = 'packages/core/src/domain/generated/output.ts';

@injectable()
export class TypespecFreshnessDiagnostic implements IDiagnostic {
  readonly name = 'typespec-freshness';

  constructor(
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    private readonly workspaceRoot: string = process.cwd()
  ) {}

  async run(): Promise<DiagnosticResult> {
    const tspDir = path.join(this.workspaceRoot, 'tsp');
    const generatedPath = path.join(this.workspaceRoot, GENERATED_RELATIVE);
    if (!this.fileSystem.pathExists(tspDir)) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: 'No `tsp/` directory at workspace root — skipping freshness check',
      };
    }
    if (!this.fileSystem.pathExists(generatedPath)) {
      return {
        name: this.name,
        status: DiagnosticStatus.Fail,
        detail: 'Generated output `domain/generated/output.ts` is missing',
        fixHint: 'Run `pnpm tsp:compile` to regenerate domain types',
      };
    }
    const generatedMtime = statSync(generatedPath).mtimeMs;
    const newestTspMtime = newestMtime(tspDir);
    if (newestTspMtime > generatedMtime) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: 'TypeSpec sources are newer than the generated output',
        fixHint: 'Run `pnpm tsp:compile` to regenerate `domain/generated/output.ts`',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: 'Generated TypeSpec output is up to date',
    };
  }
}

function newestMtime(root: string): number {
  let newest = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(child));
    } else if (entry.isFile() && entry.name.endsWith('.tsp')) {
      newest = Math.max(newest, statSync(child).mtimeMs);
    }
  }
  return newest;
}
