/**
 * ImportHarnessVersionUseCase (spec 150) — `shep learn adopt --from-dir`: a
 * person brings a harness they wrote in the canonical layout. It is checked by
 * the same validator the improver must pass (after the same automatic skill
 * trigger lines), stored as a Manual-origin version
 * of the repository's harness, and adopted. A person may adopt scripts and
 * hooks; only the automatic path may not.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '../../../domain/generated/output.js';
import {
  autotrigger,
  componentsFromTree,
  diffHarness,
  isUnchanged,
  treeFromComponents,
} from '../../../domain/harness-learning/harness-tree.js';
import { validateHarnessTree } from '../../../domain/harness-learning/harness-validator.js';
import { resolveLearningConfig } from '../../../domain/harness-learning/learning-config.js';
import { normalizeRepositoryPath } from '../../../domain/shared/repository-path.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IEvidenceWorkspace } from '../../ports/output/services/evidence-workspace.interface.js';
import { AdoptHarnessVersionUseCase } from './adopt-harness-version.use-case.js';
import { sha256 } from './refinement-records.js';

export interface ImportHarnessVersionInput {
  repositoryPath: string;
  /** Directory holding the harness in the canonical layout. */
  directory: string;
  /** Who imported it, e.g. `user:cli`. */
  actor: string;
}

export interface ImportHarnessVersionResult {
  imported: boolean;
  adopted: boolean;
  versionId?: string;
  /** Why the directory was refused; empty when it was imported. */
  problems: string[];
}

const refused = (problems: string[]): ImportHarnessVersionResult => ({
  imported: false,
  adopted: false,
  problems,
});

@injectable()
export class ImportHarnessVersionUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository,
    @inject('IEvidenceWorkspace') private readonly workspace: IEvidenceWorkspace,
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject(AdoptHarnessVersionUseCase) private readonly adopt: AdoptHarnessVersionUseCase
  ) {}

  async execute(input: ImportHarnessVersionInput): Promise<ImportHarnessVersionResult> {
    const repositoryPath = normalizeRepositoryPath(input.repositoryPath);
    const read = await this.workspace.readHarnessDirectory(input.directory);
    const { rejected } = read;
    if (Object.keys(read.tree).length === 0 && rejected.length === 0) {
      return refused([`no harness files found in ${input.directory}`]);
    }
    const settings = await this.settings.load().catch(() => null);
    const { alwaysOnCharCap } = resolveLearningConfig(settings?.learning);
    // Same convenience the improver gets: every skill is named in always-on text.
    const { tree } = autotrigger(read.tree, alwaysOnCharCap);
    const problems = [
      ...rejected.map((path) => `${path} is not on the editable surface`),
      ...validateHarnessTree(tree, { alwaysOnCharCap }),
    ];
    if (problems.length > 0) return refused(problems);

    const parent = await this.harnesses.findAdopted({ repositoryPath });
    const own = parent?.repositoryPath === repositoryPath ? parent : null;
    if (own && isUnchanged(diffHarness(treeFromComponents(own.components), tree))) {
      return refused(['the directory matches the adopted harness; nothing to import']);
    }

    const now = new Date();
    const version: LearnedHarnessVersion = {
      id: randomUUID(),
      scope: MemoryScope.Project,
      repositoryPath,
      ...(own ? { parentVersionId: own.id } : {}),
      status: LearnedHarnessStatus.Candidate,
      origin: HarnessOrigin.Manual,
      components: componentsFromTree(tree, sha256),
      notes: `Imported by ${input.actor}`,
      createdAt: now,
      updatedAt: now,
    };
    await this.harnesses.createVersion(version);
    const { adopted } = await this.adopt.execute({ versionId: version.id, actor: input.actor });
    return { imported: true, adopted, versionId: version.id, problems: [] };
  }
}
