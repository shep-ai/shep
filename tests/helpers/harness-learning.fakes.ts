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
import type {
  EvidenceFiles,
  HarvestedHarness,
  IEvidenceWorkspace,
} from '@/application/ports/output/services/evidence-workspace.interface.js';
import {
  ImproverError,
  type IHarnessImprover,
  type ImproverMission,
  type ImproverReply,
} from '@/application/ports/output/services/harness-improver.interface.js';
import type { HarnessTree } from '@/domain/harness-learning/harness-tree.js';
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

  async findVersionsByIdPrefix(prefix: string, limit: number): Promise<LearnedHarnessVersion[]> {
    return [...this.versions.values()]
      .filter((v) => v.id.startsWith(prefix))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((v) => structuredClone(v));
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

/* ------------------------------------------------------------------ */
/*  Improver + evidence workspace fakes                               */
/* ------------------------------------------------------------------ */

export interface FakeWorkspaceEntry {
  label: string;
  files: EvidenceFiles;
  harness: HarnessTree;
  disposed: boolean;
}

/** An evidence workspace held in memory; an improver edits `harness` in place. */
export class InMemoryEvidenceWorkspace implements IEvidenceWorkspace {
  readonly roots = new Map<string, FakeWorkspaceEntry>();
  /** Off-surface paths a fake improver "left" in the workspace, by root. */
  readonly rejected = new Map<string, string[]>();
  private next = 0;

  async create(label: string, files: EvidenceFiles, harness: HarnessTree): Promise<string> {
    const root = `/ws/${++this.next}-${label}`;
    this.roots.set(root, { label, files: { ...files }, harness: { ...harness }, disposed: false });
    return root;
  }

  async readHarness(root: string): Promise<HarvestedHarness> {
    const entry = this.roots.get(root);
    return { tree: { ...(entry?.harness ?? {}) }, rejected: this.rejected.get(root) ?? [] };
  }

  /** Hand-written harness directories, by path. */
  readonly directories = new Map<string, HarvestedHarness>();

  async readHarnessDirectory(dir: string): Promise<HarvestedHarness> {
    const found = this.directories.get(dir);
    return { tree: { ...(found?.tree ?? {}) }, rejected: [...(found?.rejected ?? [])] };
  }

  async dispose(root: string): Promise<void> {
    const entry = this.roots.get(root);
    if (entry) entry.disposed = true;
  }

  entry(root: string): FakeWorkspaceEntry {
    const e = this.roots.get(root);
    if (!e) throw new Error(`no workspace ${root}`);
    return e;
  }
}

/** One scripted improver turn: edit the workspace harness and/or reply. */
export type ImproverScript = (
  mission: ImproverMission,
  workspace: FakeWorkspaceEntry
) => { text?: string; costUsd?: number; fail?: string } | void;

/**
 * An improver that runs a script per stage label prefix (`inv`, `dom`, `agg`,
 * `c`, `select`, `experience`). Unscripted stages reply KEEP_BASE.
 */
export class ScriptedImprover implements IHarnessImprover {
  readonly missions: ImproverMission[] = [];

  constructor(
    private readonly workspace: InMemoryEvidenceWorkspace,
    private readonly scripts: Record<string, ImproverScript> = {}
  ) {}

  async run(mission: ImproverMission): Promise<ImproverReply> {
    this.missions.push(mission);
    const base = mission.label.split('.')[0];
    const key = Object.keys(this.scripts)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => base.startsWith(prefix));
    const out = key
      ? this.scripts[key](mission, this.workspace.entry(mission.workspaceRoot))
      : undefined;
    if (out && out.fail) throw new ImproverError(out.fail, out.costUsd ?? 0);
    return { text: out?.text ?? '<notes>KEEP_BASE</notes>', costUsd: out?.costUsd ?? 0.1 };
  }
}
