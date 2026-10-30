/**
 * Writing the outcome of a refinement (spec 150), shared by Reflect and
 * Explore: the experience session, then the candidate version, its edit
 * records and at most one lesson — the harnessing-level recursion of
 * Harness² (`reflect_adoption` / `_distil` / `Library.add`).
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  HarnessEditDimension,
  HarnessEditVerdict,
  HarnessImproverStage,
  LearnedHarnessStatus,
  type HarnessEditRecord,
  type HarnessLesson,
  type HarnessOrigin,
  type LearnedHarnessVersion,
  MemoryScope,
} from '../../../domain/generated/output.js';
import {
  componentsFromTree,
  diffHarness,
  type HarnessTree,
} from '../../../domain/harness-learning/harness-tree.js';
import {
  capLessonConfidence,
  parseEditRows,
  parseExperience,
  type ParsedEditRow,
  type ParsedExperience,
} from '../../../domain/harness-learning/improver-reply-parsers.js';
import type {
  HarnessScopeKey,
  ILearnedHarnessRepository,
} from '../../ports/output/repositories/learned-harness-repository.interface.js';
import type { EvidenceFiles } from '../../ports/output/services/evidence-workspace.interface.js';
import { ImproverError } from '../../ports/output/services/harness-improver.interface.js';
import { treeFiles } from './evidence-render.js';
import type { StageDeps, StageResult } from './run-improver-stage.js';

export const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const EXPERIENCE_LABEL = 'experience';
const INV_PREFIX = 'inv';
const DOM_PREFIX = 'dom';

/** The candidate pool as evidence: each stage's harness and notes. */
export function poolFiles(
  stages: readonly StageResult[],
  probes: Record<string, string> = {}
): EvidenceFiles {
  const files: EvidenceFiles = {};
  for (const s of stages) {
    Object.assign(files, treeFiles(`pool/${s.label}/harness`, s.tree));
    if (probes[s.label]) files[`pool/${s.label}/run.md`] = probes[s.label];
  }
  files['decisions.md'] = stages
    .map(
      (s) =>
        `## ${s.label}\n\n${s.fellBack ? `fell back: ${s.error ?? ''}` : s.notes || '(no notes)'}`
    )
    .join('\n\n');
  return files;
}

export interface ExperienceOutcome {
  rows: ParsedEditRow[];
  experience?: ParsedExperience;
  costUsd: number;
  sessions: number;
}

/** Run the experience session over the whole round. Never throws. */
export async function runExperience(
  deps: StageDeps,
  input: {
    evidence: EvidenceFiles;
    base: HarnessTree;
    candidate: HarnessTree;
    pool: EvidenceFiles;
    adoption: string;
    untested: boolean;
    alwaysOnCharCap: number;
    featureId: string;
  }
): Promise<ExperienceOutcome> {
  const files = {
    ...input.evidence,
    ...input.pool,
    ...treeFiles('base_harness', input.base),
    'adoption.md': input.adoption,
  };
  const root = await deps.workspace.create(EXPERIENCE_LABEL, files, input.candidate);
  try {
    const reply = await deps.improver.run({
      label: EXPERIENCE_LABEL,
      spec: {
        stage: HarnessImproverStage.Experience,
        k: 1,
        index: 1,
        untested: input.untested,
        alwaysOnCharCap: input.alwaysOnCharCap,
      },
      workspaceRoot: root,
      featureId: input.featureId,
    });
    const parsed = parseExperience(reply.text);
    return {
      rows: parseEditRows(reply.text),
      ...(parsed.ok ? { experience: parsed.experience } : {}),
      costUsd: reply.costUsd,
      sessions: 1,
    };
  } catch (error) {
    return { rows: [], costUsd: error instanceof ImproverError ? error.costUsd : 0, sessions: 1 };
  } finally {
    await deps.workspace.dispose(root);
  }
}

function dimensionOf(candidates: readonly string[]): HarnessEditDimension {
  if (candidates.some((c) => c.startsWith(INV_PREFIX))) return HarnessEditDimension.Inv;
  if (candidates.some((c) => c.startsWith(DOM_PREFIX))) return HarnessEditDimension.Dom;
  return HarnessEditDimension.Compose;
}

export interface CandidateRecordInput {
  scope: HarnessScopeKey;
  parent: LearnedHarnessVersion | null;
  tree: HarnessTree;
  origin: HarnessOrigin;
  notes: string;
  featureId: string;
  refinementRunId: string;
  experience: ExperienceOutcome;
  /** Reflect mode: no edit was executed, so every verdict is Untested. */
  untested: boolean;
}

/** Store the candidate, its edit records and at most one lesson. Returns the candidate. */
export async function recordCandidate(
  repo: ILearnedHarnessRepository,
  input: CandidateRecordInput
): Promise<LearnedHarnessVersion> {
  const now = new Date();
  const version: LearnedHarnessVersion = {
    id: randomUUID(),
    scope: MemoryScope.Project,
    repositoryPath: input.scope.repositoryPath,
    ...(input.scope.spaceId ? { spaceId: input.scope.spaceId } : {}),
    ...(input.scope.productLineId ? { productLineId: input.scope.productLineId } : {}),
    ...(input.parent ? { parentVersionId: input.parent.id } : {}),
    status: LearnedHarnessStatus.Candidate,
    origin: input.origin,
    components: componentsFromTree(input.tree, sha256),
    ...(input.notes ? { notes: input.notes } : {}),
    sourceFeatureId: input.featureId,
    refinementRunId: input.refinementRunId,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createVersion(version);

  const rows: ParsedEditRow[] = input.experience.rows.length
    ? input.experience.rows
    : fallbackRows(input.parent, input.tree, input.notes);
  const records: HarnessEditRecord[] = rows.map((row) => ({
    id: randomUUID(),
    versionId: version.id,
    refinementRunId: input.refinementRunId,
    dimension: dimensionOf(row.candidates),
    componentPath: row.component,
    change: row.change,
    observed: row.observed,
    verdict: input.untested ? HarnessEditVerdict.Untested : row.verdict,
    createdAt: now,
    updatedAt: now,
  }));
  if (records.length) await repo.createEditRecords(records);

  const exp = input.experience.experience;
  if (exp) {
    const lesson: HarnessLesson = {
      id: randomUUID(),
      scope: MemoryScope.Project,
      repositoryPath: input.scope.repositoryPath,
      ...(input.scope.spaceId ? { spaceId: input.scope.spaceId } : {}),
      ...(input.scope.productLineId ? { productLineId: input.scope.productLineId } : {}),
      cue: exp.cue,
      lesson: exp.lesson,
      evidence: exp.evidence,
      confidence: capLessonConfidence(
        exp.confidence,
        records.map((r) => r.verdict)
      ),
      sourceFeatureId: input.featureId,
      versionId: version.id,
      createdAt: now,
      updatedAt: now,
    };
    await repo.createLesson(lesson);
  }
  return version;
}

/** When the reflector wrote no rows, one row per changed component, from the diff. */
function fallbackRows(
  parent: LearnedHarnessVersion | null,
  tree: HarnessTree,
  notes: string
): ParsedEditRow[] {
  const before: HarnessTree = {};
  for (const c of parent?.components ?? []) before[c.path] = c.content;
  const diff = diffHarness(before, tree);
  const rows = (paths: string[], change: string) =>
    paths.map((component) => ({
      component,
      candidates: [],
      change,
      observed: notes.slice(0, 500),
      verdict: HarnessEditVerdict.Confounded,
    }));
  return [
    ...rows(diff.added, 'added'),
    ...rows(diff.modified, 'modified'),
    ...rows(diff.removed, 'removed'),
  ];
}
