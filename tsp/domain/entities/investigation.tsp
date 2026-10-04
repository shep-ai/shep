/**
 * @module Shep.Domain.Entities.Investigation
 *
 * Bug loop (spec 123): an agent reads a repository in a throwaway detached
 * worktree and proposes ranked root-cause hypotheses for a work item. An
 * approved hypothesis becomes a test-first fix feature.
 */
import "../../common/base.tsp";
import "../../common/enums/agent-config.tsp";

/** Where an investigation is in its life. */
@doc("Where a work item investigation is in its life")
enum InvestigationStatus {
  @doc("Recorded; the agent has not started")
  Pending,

  @doc("The agent is reading the repository")
  Running,

  @doc("Hypotheses are ready")
  Completed,

  @doc("The investigation stopped; see error")
  Failed,
}

/** How strongly the evidence supports a hypothesis. */
@doc("How strongly the evidence supports a root-cause hypothesis")
enum HypothesisConfidence {
  @doc("The evidence points directly at this cause")
  High,

  @doc("Plausible and consistent with the evidence")
  Medium,

  @doc("Possible; the evidence is thin")
  Low,
}

/** A place in the code that supports a hypothesis. */
@doc("A place in the code that supports a hypothesis")
model HypothesisEvidence {
  @doc("Repository-relative path with forward slashes")
  file: string;

  @doc("1-based line, when the evidence is a specific line")
  line?: int32;

  @doc("What this place shows")
  note: string;
}

/** One candidate root cause. */
@doc("One candidate root cause for a bug, with its evidence and how to fix it")
model Hypothesis {
  @doc("Rank from 1 (most likely)")
  number: int32;

  @doc("Short name of the cause")
  title: string;

  @doc("What goes wrong and why")
  rootCause: string;

  @doc("How strongly the evidence supports it")
  confidence: HypothesisConfidence;

  @doc("Places in the code that support it")
  evidence: HypothesisEvidence[];

  @doc("The failing test that would prove it")
  testPlan: string;

  @doc("How to fix it")
  fixPlan: string;
}

/** An agent's investigation of a work item in one repository. */
@doc("An agent's investigation of a work item in one repository, and the fix it led to")
model WorkItemInvestigation extends BaseEntity {
  @doc("The work item investigated")
  workItemId: string;

  @doc("The repository read")
  repositoryPath: string;

  @doc("The commit read")
  commitSha?: string;

  @doc("Where the investigation is")
  status: InvestigationStatus;

  @doc("The agent's overall reading of the bug")
  summary?: string;

  @doc("Candidate root causes, most likely first")
  hypotheses: Hypothesis[];

  @doc("The agent that investigated")
  agentType?: AgentType;

  @doc("Why the investigation failed")
  error?: string;

  @doc("When the agent started")
  startedAt?: utcDateTime;

  @doc("When the investigation completed or failed")
  finishedAt?: utcDateTime;

  @doc("The hypothesis approved for fixing")
  approvedHypothesisNumber?: int32;

  @doc("The feature created to fix it")
  featureId?: string;
}
