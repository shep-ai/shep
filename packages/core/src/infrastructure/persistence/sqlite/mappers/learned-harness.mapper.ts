/**
 * Row ⇄ entity mapping for the learned-harness tables (spec 150, migration 176).
 *
 * Timestamps are unix milliseconds; optional text columns are NULL when absent;
 * `components` is a JSON array of HarnessComponent.
 */

import type {
  HarnessComponent,
  HarnessEditDimension,
  HarnessEditRecord,
  HarnessEditVerdict,
  HarnessLesson,
  HarnessOrigin,
  HarnessRecursion,
  HarnessRefinementRun,
  HarnessRefinementStatus,
  HarnessVersionOutcome,
  LearnedHarnessStatus,
  LearnedHarnessVersion,
  LearningMode,
  LessonConfidence,
  MemoryScope,
} from '../../../../domain/generated/output.js';

const ms = (d: Date | string): number => new Date(d).getTime();
const date = (n: number): Date => new Date(n);
const opt = <K extends string, V>(key: K, value: V | null | undefined) =>
  (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;

export interface LearnedHarnessVersionRow {
  id: string;
  scope: string;
  repository_path: string;
  space_id: string | null;
  product_line_id: string | null;
  parent_version_id: string | null;
  status: string;
  origin: string;
  components: string;
  notes: string | null;
  source_feature_id: string | null;
  refinement_run_id: string | null;
  status_reason: string | null;
  created_at: number;
  updated_at: number;
}

export function versionToRow(v: LearnedHarnessVersion): LearnedHarnessVersionRow {
  return {
    id: v.id,
    scope: v.scope,
    repository_path: v.repositoryPath,
    space_id: v.spaceId ?? null,
    product_line_id: v.productLineId ?? null,
    parent_version_id: v.parentVersionId ?? null,
    status: v.status,
    origin: v.origin,
    components: JSON.stringify(v.components),
    notes: v.notes ?? null,
    source_feature_id: v.sourceFeatureId ?? null,
    refinement_run_id: v.refinementRunId ?? null,
    status_reason: v.statusReason ?? null,
    created_at: ms(v.createdAt),
    updated_at: ms(v.updatedAt),
  };
}

export function versionFromRow(r: LearnedHarnessVersionRow): LearnedHarnessVersion {
  return {
    id: r.id,
    scope: r.scope as MemoryScope,
    repositoryPath: r.repository_path,
    ...opt('spaceId', r.space_id),
    ...opt('productLineId', r.product_line_id),
    ...opt('parentVersionId', r.parent_version_id),
    status: r.status as LearnedHarnessStatus,
    origin: r.origin as HarnessOrigin,
    components: JSON.parse(r.components) as HarnessComponent[],
    ...opt('notes', r.notes),
    ...opt('sourceFeatureId', r.source_feature_id),
    ...opt('refinementRunId', r.refinement_run_id),
    ...opt('statusReason', r.status_reason),
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

export interface HarnessEditRow {
  id: string;
  version_id: string;
  refinement_run_id: string;
  dimension: string;
  component_path: string;
  change: string;
  observed: string;
  verdict: string;
  created_at: number;
  updated_at: number;
}

export function editToRow(e: HarnessEditRecord): HarnessEditRow {
  return {
    id: e.id,
    version_id: e.versionId,
    refinement_run_id: e.refinementRunId,
    dimension: e.dimension,
    component_path: e.componentPath,
    change: e.change,
    observed: e.observed,
    verdict: e.verdict,
    created_at: ms(e.createdAt),
    updated_at: ms(e.updatedAt),
  };
}

export function editFromRow(r: HarnessEditRow): HarnessEditRecord {
  return {
    id: r.id,
    versionId: r.version_id,
    refinementRunId: r.refinement_run_id,
    dimension: r.dimension as HarnessEditDimension,
    componentPath: r.component_path,
    change: r.change,
    observed: r.observed,
    verdict: r.verdict as HarnessEditVerdict,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

export interface HarnessLessonRow {
  id: string;
  scope: string;
  repository_path: string;
  space_id: string | null;
  product_line_id: string | null;
  cue: string;
  lesson: string;
  evidence: string;
  confidence: string;
  source_feature_id: string;
  version_id: string;
  created_at: number;
  updated_at: number;
}

export function lessonToRow(l: HarnessLesson): HarnessLessonRow {
  return {
    id: l.id,
    scope: l.scope,
    repository_path: l.repositoryPath,
    space_id: l.spaceId ?? null,
    product_line_id: l.productLineId ?? null,
    cue: l.cue,
    lesson: l.lesson,
    evidence: l.evidence,
    confidence: l.confidence,
    source_feature_id: l.sourceFeatureId,
    version_id: l.versionId,
    created_at: ms(l.createdAt),
    updated_at: ms(l.updatedAt),
  };
}

export function lessonFromRow(r: HarnessLessonRow): HarnessLesson {
  return {
    id: r.id,
    scope: r.scope as MemoryScope,
    repositoryPath: r.repository_path,
    ...opt('spaceId', r.space_id),
    ...opt('productLineId', r.product_line_id),
    cue: r.cue,
    lesson: r.lesson,
    evidence: r.evidence,
    confidence: r.confidence as LessonConfidence,
    sourceFeatureId: r.source_feature_id,
    versionId: r.version_id,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

export interface HarnessRefinementRunRow {
  id: string;
  feature_id: string;
  repository_path: string;
  mode: string;
  recursion: string | null;
  k: number;
  rollouts: number;
  sessions: number;
  cost_usd: number;
  status: string;
  candidate_version_id: string | null;
  chosen_label: string | null;
  selection_reason: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export function runToRow(r: HarnessRefinementRun): HarnessRefinementRunRow {
  return {
    id: r.id,
    feature_id: r.featureId,
    repository_path: r.repositoryPath,
    mode: r.mode,
    recursion: r.recursion ?? null,
    k: r.k,
    rollouts: r.rollouts,
    sessions: r.sessions,
    cost_usd: r.costUsd,
    status: r.status,
    candidate_version_id: r.candidateVersionId ?? null,
    chosen_label: r.chosenLabel ?? null,
    selection_reason: r.selectionReason ?? null,
    error: r.error ?? null,
    created_at: ms(r.createdAt),
    updated_at: ms(r.updatedAt),
  };
}

export function runFromRow(r: HarnessRefinementRunRow): HarnessRefinementRun {
  return {
    id: r.id,
    featureId: r.feature_id,
    repositoryPath: r.repository_path,
    mode: r.mode as LearningMode,
    ...opt('recursion', r.recursion as HarnessRecursion | null),
    k: r.k,
    rollouts: r.rollouts,
    sessions: r.sessions,
    costUsd: r.cost_usd,
    status: r.status as HarnessRefinementStatus,
    ...opt('candidateVersionId', r.candidate_version_id),
    ...opt('chosenLabel', r.chosen_label),
    ...opt('selectionReason', r.selection_reason),
    ...opt('error', r.error),
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

export interface HarnessOutcomeRow {
  id: string;
  version_id: string;
  feature_id: string;
  ci_fix_attempts: number;
  gate_rejections: number;
  validation_repairs: number;
  num_turns: number;
  cost_usd: number;
  merged: number;
  created_at: number;
  updated_at: number;
}

export function outcomeToRow(o: HarnessVersionOutcome): HarnessOutcomeRow {
  return {
    id: o.id,
    version_id: o.versionId,
    feature_id: o.featureId,
    ci_fix_attempts: o.ciFixAttempts,
    gate_rejections: o.gateRejections,
    validation_repairs: o.validationRepairs,
    num_turns: o.numTurns,
    cost_usd: o.costUsd,
    merged: o.merged ? 1 : 0,
    created_at: ms(o.createdAt),
    updated_at: ms(o.updatedAt),
  };
}

export function outcomeFromRow(r: HarnessOutcomeRow): HarnessVersionOutcome {
  return {
    id: r.id,
    versionId: r.version_id,
    featureId: r.feature_id,
    ciFixAttempts: r.ci_fix_attempts,
    gateRejections: r.gate_rejections,
    validationRepairs: r.validation_repairs,
    numTurns: r.num_turns,
    costUsd: r.cost_usd,
    merged: r.merged === 1,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}
