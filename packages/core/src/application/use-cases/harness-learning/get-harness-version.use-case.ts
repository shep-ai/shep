/**
 * GetHarnessVersionUseCase (spec 150) — one version with its components, its
 * edit records and a readable diff against its parent (or against another
 * version, for `shep learn diff a b`).
 */

import { inject, injectable } from 'tsyringe';
import type { HarnessEditRecord, LearnedHarnessVersion } from '../../../domain/generated/output.js';
import { renderHarnessDiffText } from '../../../domain/harness-learning/harness-decision.js';
import {
  diffHarness,
  treeFromComponents,
  type HarnessDiff,
} from '../../../domain/harness-learning/harness-tree.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';
import { resolveHarnessVersion } from './resolve-harness-version.js';

export interface HarnessVersionDetail {
  version: LearnedHarnessVersion;
  /** The version compared against: the given one, else the parent. */
  base?: LearnedHarnessVersion;
  diff: HarnessDiff;
  diffText: string;
  edits: HarnessEditRecord[];
}

@injectable()
export class GetHarnessVersionUseCase {
  constructor(
    @inject('ILearnedHarnessRepository') private readonly harnesses: ILearnedHarnessRepository
  ) {}

  async execute(input: {
    versionId: string;
    againstVersionId?: string;
  }): Promise<HarnessVersionDetail | null> {
    const version = await resolveHarnessVersion(this.harnesses, input.versionId);
    if (!version) return null;
    const base = await this.baseFor(version, input.againstVersionId);
    if (input.againstVersionId && !base) return null;
    const before = treeFromComponents(base?.components ?? []);
    const after = treeFromComponents(version.components);
    return {
      version,
      ...(base ? { base } : {}),
      diff: diffHarness(before, after),
      diffText: renderHarnessDiffText(before, after),
      edits: await this.harnesses.listEditRecords(version.id),
    };
  }

  /** The version to diff against: the one asked for, else the parent. */
  private async baseFor(
    version: LearnedHarnessVersion,
    againstVersionId?: string
  ): Promise<LearnedHarnessVersion | null> {
    if (againstVersionId) return resolveHarnessVersion(this.harnesses, againstVersionId);
    return version.parentVersionId ? this.harnesses.findVersion(version.parentVersionId) : null;
  }
}
