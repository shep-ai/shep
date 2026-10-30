/* global process, console */
/**
 * Not recorded: gives the demo repository a learning history (spec 150).
 *
 *   baseline  five runs on the adopted version: merged, little friction (and
 *             the demo features named after their descriptions, onboarding
 *             marked done so commands run on a terminal skip the wizard)
 *   history   five worse runs on the version adopted since (so it reads as
 *             Regressed), then a Reflect candidate built on it — edit verdicts,
 *             a lesson — offered through OfferHarnessCandidateUseCase, which
 *             files the HarnessChange decision in the inbox like a real run.
 *
 * Run from the repository root after `pnpm build` (it loads the built core
 * from dist/): node <this file> <step>
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A module of the built core, loaded from dist/ (run from the repository root). */
const core = (path) =>
  import(pathToFileURL(join(process.cwd(), 'dist/packages/core/src', path)).href);

await import('reflect-metadata');
const { container, initializeContainer } = await core('infrastructure/di/container.js');
const { InitializeSettingsUseCase } = await core(
  'application/use-cases/settings/initialize-settings.use-case.js'
);
const { initializeSettings } = await core('infrastructure/services/settings.service.js');
const { CompleteWebOnboardingUseCase } = await core(
  'application/use-cases/settings/complete-web-onboarding.use-case.js'
);
const { OfferHarnessCandidateUseCase } = await core(
  'application/use-cases/harness-learning/offer-harness-candidate.use-case.js'
);
const { sha256 } = await core('application/use-cases/harness-learning/refinement-records.js');
const { autotrigger, componentsFromTree, treeFromComponents } = await core(
  'domain/harness-learning/harness-tree.js'
);
const { validateHarnessTree } = await core('domain/harness-learning/harness-validator.js');
const { normalizeRepositoryPath } = await core('domain/shared/repository-path.js');
const {
  HarnessEditDimension,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessRefinementStatus,
  LearnedHarnessStatus,
  LearningMode,
  LessonConfidence,
  MemoryScope,
} = await core('domain/generated/output.js');

const RUNS = 5;
const CAP = 4000;
const step = process.argv[2];
const demoDir = process.env.DEMO_DIR ?? '/tmp/shep-learn-demo';
const repo = normalizeRepositoryPath(process.env.REPO ?? join(demoDir, 'shop'));
/** Ids later scenes type, as short prefixes (`shep learn` accepts them). */
const remember = (key, id) =>
  appendFileSync(join(demoDir, 'state.env'), `${key}=${id.slice(0, 8)}\n`);

await initializeContainer();
const settings = await container.resolve(InitializeSettingsUseCase).execute();
initializeSettings(settings);
const harnesses = container.resolve('ILearnedHarnessRepository');
const runs = container.resolve('IHarnessRefinementRepository');
const featureRepo = container.resolve('IFeatureRepository');
const features = await featureRepo.list({ repositoryPath: repo });
const current = await harnesses.findAdopted({ repositoryPath: repo });
if (!current) throw new Error(`nothing adopted for ${repo}; run 00-setup.sh first`);

async function outcomes(versionId, rough) {
  for (let i = 0; i < RUNS; i++) {
    const now = new Date();
    await runs.upsertOutcome({
      id: randomUUID(),
      versionId,
      featureId: `demo-run-${versionId.slice(0, 4)}-${i}`,
      ciFixAttempts: rough ? 3 : 0,
      gateRejections: rough ? 1 : 0,
      validationRepairs: rough ? 1 : 0,
      numTurns: rough ? 140 : 60,
      costUsd: rough ? 4.2 : 1.8,
      merged: !rough || i % 2 === 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

if (step === 'baseline') {
  await outcomes(current.id, false);
  remember('V0', current.id);
  // Skip the first-run wizard, keeping the configured agent (the dev agent).
  await container
    .resolve(CompleteWebOnboardingUseCase)
    .execute({ agentType: settings.agent.type, model: null });
  // The dev agent invents feature names; show what the features are for instead.
  for (const f of features) await featureRepo.update({ ...f, name: f.userQuery });
} else if (step === 'history') {
  await outcomes(current.id, true);
  const feature = features[0];
  if (!feature?.agentRunId) throw new Error('no demo feature; run 00-setup.sh first');

  const tree = {
    ...treeFromComponents(current.components),
    'skills/refunds-export/SKILL.md': [
      '---',
      'name: refunds-export',
      'description: Export refunds or payments to CSV without loading every row',
      '---',
      '',
      '1. Stream rows from the database cursor; never build the whole file in memory.',
      '2. Quote every field and write a header row.',
      '3. Run `scripts/check_exports.sh` on the result before you finish.',
    ].join('\n'),
    'scripts/check_exports.sh': [
      '#!/usr/bin/env bash',
      '# Fails when a CSV export has a ragged row.',
      'awk -F, \'NR==1{n=NF} NF!=n{print FILENAME": row "NR" has "NF" fields"; bad=1} END{exit bad}\' "$@"',
    ].join('\n'),
    'guardrails.md': `${treeFromComponents(current.components)['guardrails.md'] ?? ''}- Run every new migration twice; it must be idempotent.\n`,
  };
  const { tree: candidateTree } = autotrigger(tree, CAP);
  const problems = validateHarnessTree(candidateTree, { alwaysOnCharCap: CAP });
  if (problems.length) throw new Error(problems.join('\n'));

  const now = new Date();
  const runId = randomUUID();
  await runs.createRun({
    id: runId,
    featureId: feature.id,
    repositoryPath: repo,
    mode: LearningMode.Reflect,
    k: 0,
    rollouts: 0,
    sessions: 4,
    costUsd: 0.62,
    status: HarnessRefinementStatus.Proposed,
    createdAt: now,
    updatedAt: now,
  });
  const candidate = {
    id: randomUUID(),
    scope: MemoryScope.Project,
    repositoryPath: repo,
    parentVersionId: current.id,
    status: LearnedHarnessStatus.Candidate,
    origin: HarnessOrigin.Reflect,
    components: componentsFromTree(candidateTree, sha256),
    notes:
      'kept -> refunds-export skill -> the CSV export failed CI twice on ragged rows\n' +
      'kept -> check_exports.sh -> the agent never checked the file it wrote',
    sourceFeatureId: feature.id,
    refinementRunId: runId,
    createdAt: now,
    updatedAt: now,
  };
  await harnesses.createVersion(candidate);
  await harnesses.createEditRecords(
    [
      ['skills/refunds-export/SKILL.md', 'Added a streaming CSV export skill'],
      ['scripts/check_exports.sh', 'Added a ragged-row check for CSV files'],
      ['guardrails.md', 'Run new migrations twice'],
    ].map(([componentPath, change]) => ({
      id: randomUUID(),
      versionId: candidate.id,
      refinementRunId: runId,
      dimension: HarnessEditDimension.Dom,
      componentPath,
      change,
      observed: 'CI-fix attempts 1 and 2 failed on the same malformed export',
      verdict: HarnessEditVerdict.Untested,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await harnesses.createLesson({
    id: randomUUID(),
    scope: MemoryScope.Project,
    repositoryPath: repo,
    cue: 'a feature writes a CSV or other export file',
    lesson: 'give the agent a checker script and tell it to run it on its own output',
    evidence: 'Export refunds as CSV: two CI-fix rounds on ragged rows before the check existed',
    confidence: LessonConfidence.Low,
    sourceFeatureId: feature.id,
    versionId: candidate.id,
    createdAt: now,
    updatedAt: now,
  });
  const offered = await container.resolve(OfferHarnessCandidateUseCase).execute({
    candidate,
    parent: current,
    featureName: feature.name,
    agentRunId: feature.agentRunId,
  });
  remember('V1', current.id);
  remember('CANDIDATE', candidate.id);
  console.log(
    `candidate ${candidate.id.slice(0, 8)} offered; question ${offered.questionId ?? '-'}`
  );
} else {
  throw new Error('usage: seed-history.mjs baseline|history');
}
process.exit(0);
