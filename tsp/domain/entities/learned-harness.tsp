/**
 * @module Shep.Domain.Entities.LearnedHarness
 *
 * The self-learning harness (spec 150). A harness is everything around the
 * model that lets it act as an agent; Shep keeps a learned *overlay* of it per
 * scope (repository, space or product line — the same scope as Shep Brain).
 * Exactly one version per scope is adopted at a time. Candidates come from
 * reflection on finished runs or from Propose-Probe-Compose exploration, and
 * each refinement leaves edit records (what each change did, with a verdict)
 * and at most one lesson that later refinements read first.
 *
 * Ideas and prompts adapted from Harness² (google-research/harness2,
 * Apache-2.0).
 */
import "../../common/base.tsp";
import "../../common/enums/learned-harness.tsp";
import "./project-memory.tsp";

@doc("One file of a learned harness overlay")
model HarnessComponent {
  @doc("Kind of component")
  kind: HarnessComponentKind;

  @doc("Path on the editable surface, e.g. skills/db-migration/SKILL.md")
  path: string;

  @doc("File content")
  content: string;

  @doc("SHA-256 of the content, for diff and provenance")
  sha256: string;
}

@doc("One finding of the static scan of a candidate harness")
model HarnessScanFinding {
  @doc("Component path")
  path: string;

  @doc("1-based line number")
  line: int32;

  @doc("What was flagged")
  rule: HarnessScanRule;

  @doc("The flagged line, trimmed")
  excerpt: string;
}

@doc("A version of the learned harness overlay for one scope")
model LearnedHarnessVersion extends BaseEntity {
  @doc("Reach of this version: Project (default), ProductLine or Space")
  scope: MemoryScope;

  @doc("Normalised repository path the version was learned in")
  repositoryPath: string;

  @doc("Space of the version, when its repository has one")
  spaceId?: string;

  @doc("Product line of the version, when its repository has one")
  productLineId?: string;

  @doc("Version this one was derived from; the rollback target")
  parentVersionId?: string;

  @doc("Where the version is in its life")
  status: LearnedHarnessStatus;

  @doc("How the version was produced")
  origin: HarnessOrigin;

  @doc("The overlay's components; empty for the base version")
  components: HarnessComponent[];

  @doc("Composer notes: each kept, revised or dropped edit with the trajectory moment behind it")
  notes?: string;

  @doc("Feature whose run produced this version")
  sourceFeatureId?: string;

  @doc("Refinement that produced this version")
  refinementRunId?: string;

  @doc("Feedback given when the candidate was rejected, or why it was rolled back")
  statusReason?: string;
}

@doc("What one harness edit did, recorded by the reflector")
model HarnessEditRecord extends BaseEntity {
  @doc("Candidate version the edit belongs to")
  versionId: string;

  @doc("Refinement that produced the edit")
  refinementRunId: string;

  @doc("Editor that produced the edit")
  dimension: HarnessEditDimension;

  @doc("Changed component path")
  componentPath: string;

  @doc("What the edit changed")
  change: string;

  @doc("The execution difference it produced, and where it was seen")
  observed: string;

  @doc("Verdict on the edit")
  verdict: HarnessEditVerdict;
}

@doc("A transferable lesson about harness edits, read by later refinements in the same scope")
model HarnessLesson extends BaseEntity {
  @doc("Reach of the lesson; same isolation as harness versions")
  scope: MemoryScope;

  @doc("Normalised repository path the lesson was learned in")
  repositoryPath: string;

  @doc("Space of the lesson, when its repository has one")
  spaceId?: string;

  @doc("Product line of the lesson, when its repository has one")
  productLineId?: string;

  @doc("The shape of situation the lesson applies to")
  cue: string;

  @doc("The operation to perform on a harness, naming the component")
  lesson: string;

  @doc("The edit records and execution contrast the lesson rests on")
  evidence: string;

  @doc("How strongly the evidence supports the lesson")
  confidence: LessonConfidence;

  @doc("Feature whose run taught the lesson")
  sourceFeatureId: string;

  @doc("Version whose refinement wrote the lesson")
  versionId: string;
}

@doc("One harness refinement of one feature run, with its budget ledger")
model HarnessRefinementRun extends BaseEntity {
  @doc("Feature whose run is being learned from")
  featureId: string;

  @doc("Normalised repository path of the feature")
  repositoryPath: string;

  @doc("Reflect (no probes) or Explore (probes)")
  mode: LearningMode;

  @doc("Recursion shape, for Explore runs")
  recursion?: HarnessRecursion;

  @doc("Task-level recursion budget; 0 for Reflect")
  k: int32;

  @doc("Executions performed (4k in Explore)")
  rollouts: int32;

  @doc("Improver sessions performed (3k in Explore, 3 in Reflect)")
  sessions: int32;

  @doc("Total cost of improvement sessions and probes in USD")
  costUsd: float64;

  @doc("What became of the refinement")
  status: HarnessRefinementStatus;

  @doc("Candidate version produced, when any")
  candidateVersionId?: string;

  @doc("Label of the output chosen by blind selection")
  chosenLabel?: string;

  @doc("Why the selector chose it")
  selectionReason?: string;

  @doc("Error text when the refinement failed")
  error?: string;
}

@doc("How one finished feature did on the harness version it ran with")
model HarnessVersionOutcome extends BaseEntity {
  @doc("Version the feature ran on")
  versionId: string;

  @doc("The feature")
  featureId: string;

  @doc("CI-fix attempts in the merge phase")
  ciFixAttempts: int32;

  @doc("Approval-gate rejections across the run")
  gateRejections: int32;

  @doc("Schema validation repairs across the run")
  validationRepairs: int32;

  @doc("Agent turns across the run")
  numTurns: int32;

  @doc("Agent cost across the run in USD")
  costUsd: float64;

  @doc("Whether the feature merged")
  merged: boolean;
}
