/**
 * InitHarnessProjectUseCase (spec 119, F2 "Set up a repository" /
 * `shep harness init`): detect, preview, and write only on confirm. Files are
 * written only under `.shep/harness/`; existing files are never overwritten.
 */
import { inject, injectable } from 'tsyringe';
import {
  HARNESS_TOKENS,
  type HarnessProjectInspection,
  type IHarnessProjectSetup,
} from '../../ports/output/harness/index.js';
import { buildHarnessProjectFiles } from './harness-project-files.js';

export interface InitHarnessProjectInput {
  repoRoot: string;
  confirm: boolean;
}

export interface HarnessProjectFilePreview {
  path: string;
  content: string;
  /** The file already exists; it is kept as is. */
  exists: boolean;
}

export interface InitHarnessProjectResult {
  inspection: HarnessProjectInspection;
  files: HarnessProjectFilePreview[];
  written: string[];
}

@injectable()
export class InitHarnessProjectUseCase {
  constructor(@inject(HARNESS_TOKENS.ProjectSetup) private readonly setup: IHarnessProjectSetup) {}

  async execute(input: InitHarnessProjectInput): Promise<InitHarnessProjectResult> {
    const inspection = await this.setup.inspect(input.repoRoot);
    const files: HarnessProjectFilePreview[] = [];
    for (const f of buildHarnessProjectFiles(inspection)) {
      const existing = await this.setup.read(input.repoRoot, f.path);
      files.push({ path: f.path, content: existing ?? f.content, exists: existing !== undefined });
    }
    const toWrite = files.filter((f) => !f.exists);
    if (input.confirm && toWrite.length > 0) {
      await this.setup.write(
        input.repoRoot,
        toWrite.map(({ path, content }) => ({ path, content }))
      );
    }
    return { inspection, files, written: input.confirm ? toWrite.map((f) => f.path) : [] };
  }
}
