/**
 * In-memory fakes for the self-learning harness (spec 150).
 *
 * Every fake answers from its own rows (LESSONS.md: "a shared fake must answer
 * from its own rows, not a constant"), mirroring the SQLite semantics the
 * integration tests pin: one adopted version per scope placement, scope
 * precedence repository → product line → space.
 */

import { vi } from 'vitest';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '@/application/ports/output/repositories/learned-harness-repository.interface.js';
import type { IHarnessRefinementRepository } from '@/application/ports/output/repositories/harness-refinement-repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import {
  LearnedHarnessStatus,
  MemoryScope,
  type HarnessEditRecord,
  type HarnessLesson,
  type HarnessRefinementRun,
  type HarnessVersionOutcome,
  type LearnedHarnessVersion,
  type LearningConfig,
  type Settings,
} from '@/domain/generated/output.js';

function placement(v: LearnedHarnessVersion): string {
  if (v.scope === MemoryScope.Project) return `p:${v.repositoryPath}`;
  if (v.scope === MemoryScope.ProductLine) return `l:${v.productLineId}`;
  return `s:${v.spaceId}`;
}

export class InMemoryLearnedHarnessRepository implements ILearnedHarnessRepository {
  readonly versions = new Map<string, LearnedHarnessVersion>();
  readonly edits: HarnessEditRecord[] = [];
  readonly lessons: HarnessLesson[] = [];

  async createVersion(version: LearnedHarnessVersion): Promise<void> {
    if (this.versions.has(version.id)) throw new Error(`duplicate version ${version.id}`);
    this.versions.set(version.id, structuredClone(version));
  }

  async findVersion(id: string): Promise<LearnedHarnessVersion | null> {
    const v = this.versions.get(id);
    return v ? structuredClone(v) : null;
  }

  async listVersions(repositoryPath: string, limit = 100): Promise<LearnedHarnessVersion[]> {
    return [...this.versions.values()]
      .filter((v) => v.repositoryPath === repositoryPath)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((v) => structuredClone(v));
  }

  async findAdopted(scope: HarnessScopeKey): Promise<LearnedHarnessVersion | null> {
    const adopted = [...this.versions.values()].filter(
      (v) => v.status === LearnedHarnessStatus.Adopted
    );
    const own = adopted.find(
      (v) => v.scope === MemoryScope.Project && v.repositoryPath === scope.repositoryPath
    );
    const line = scope.productLineId
      ? adopted.find(
          (v) => v.scope === MemoryScope.ProductLine && v.productLineId === scope.productLineId
        )
      : undefined;
    const space = scope.spaceId
      ? adopted.find((v) => v.scope === MemoryScope.Space && v.spaceId === scope.spaceId)
      : undefined;
    const found = own ?? line ?? space;
    return found ? structuredClone(found) : null;
  }

  async adopt(id: string): Promise<void> {
    const target = this.versions.get(id);
    if (!target) throw new Error(`learned harness version ${id} not found`);
    for (const v of this.versions.values()) {
      if (
        v.id !== id &&
        v.status === LearnedHarnessStatus.Adopted &&
        placement(v) === placement(target)
      ) {
        v.status = LearnedHarnessStatus.Superseded;
      }
    }
    target.status = LearnedHarnessStatus.Adopted;
  }

  async updateStatus(id: string, status: LearnedHarnessStatus, reason?: string): Promise<void> {
    const v = this.versions.get(id);
    if (!v) return;
    v.status = status;
    if (reason !== undefined) v.statusReason = reason;
  }

  async createEditRecords(records: HarnessEditRecord[]): Promise<void> {
    this.edits.push(...records.map((r) => structuredClone(r)));
  }

  async listEditRecords(versionId: string): Promise<HarnessEditRecord[]> {
    return this.edits.filter((e) => e.versionId === versionId);
  }

  async createLesson(lesson: HarnessLesson): Promise<void> {
    this.lessons.push(structuredClone(lesson));
  }

  async listLessons(scope: HarnessScopeKey): Promise<HarnessLesson[]> {
    return this.lessons.filter(
      (l) =>
        (l.scope === MemoryScope.Project && l.repositoryPath === scope.repositoryPath) ||
        (l.scope === MemoryScope.ProductLine &&
          !!scope.productLineId &&
          l.productLineId === scope.productLineId) ||
        (l.scope === MemoryScope.Space && !!scope.spaceId && l.spaceId === scope.spaceId)
    );
  }
}

export class InMemoryHarnessRefinementRepository implements IHarnessRefinementRepository {
  readonly runs = new Map<string, HarnessRefinementRun>();
  readonly outcomes: HarnessVersionOutcome[] = [];

  async createRun(run: HarnessRefinementRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async updateRun(run: HarnessRefinementRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async findRun(id: string): Promise<HarnessRefinementRun | null> {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : null;
  }

  async listRunsByFeature(featureId: string): Promise<HarnessRefinementRun[]> {
    return [...this.runs.values()].filter((r) => r.featureId === featureId);
  }

  async upsertOutcome(outcome: HarnessVersionOutcome): Promise<void> {
    const i = this.outcomes.findIndex(
      (o) => o.versionId === outcome.versionId && o.featureId === outcome.featureId
    );
    if (i >= 0) this.outcomes[i] = { ...structuredClone(outcome), id: this.outcomes[i].id };
    else this.outcomes.push(structuredClone(outcome));
  }

  async listOutcomes(versionId: string): Promise<HarnessVersionOutcome[]> {
    return this.outcomes.filter((o) => o.versionId === versionId);
  }
}

/** A settings repository holding one Settings row, with the self-learning flag and config set. */
export function fakeSettingsRepository(
  options: { selfLearning?: boolean; learning?: Partial<LearningConfig> } = {}
): ISettingsRepository & { current: Settings } {
  const defaults = createDefaultSettings();
  const current: Settings = {
    ...defaults,
    featureFlags: { ...defaults.featureFlags!, selfLearning: options.selfLearning ?? true },
    ...(options.learning ? { learning: options.learning as LearningConfig } : {}),
  };
  return {
    current,
    initialize: vi.fn(async () => undefined),
    load: vi.fn(async () => current),
    update: vi.fn(async (s: Settings) => {
      Object.assign(current, s);
    }),
  } as unknown as ISettingsRepository & { current: Settings };
}

/** Resolves every repository into one space (and optional product line). */
export function fakeSpaceContext(
  spaceId = 'space-1',
  productLineId?: string
): ResolveSpaceContextUseCase {
  return {
    execute: vi.fn(async () => ({
      space: { id: spaceId, name: 'Space', slug: 'space', isDefault: true },
      ...(productLineId ? { productLine: { id: productLineId, name: 'Line' } } : {}),
    })),
  } as unknown as ResolveSpaceContextUseCase;
}
