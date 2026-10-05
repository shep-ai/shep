/**
 * @module Shep.Domain.Entities.Incident
 *
 * Incidents (spec 129): something broke in production. An incident keeps a
 * timeline of what was seen and done, and the runtime actions — restart,
 * rollback, scale — taken on the workload it concerns.
 */
import "../../common/base.tsp";

/** How bad an incident is. */
@doc("How bad an incident is")
enum IncidentSeverity {
  @doc("Users cannot use the product")
  Critical,

  @doc("A main path is broken or degraded")
  Major,

  @doc("A minor or partial problem")
  Minor,
}

/** Where an incident stands. */
@doc("Where an incident stands")
enum IncidentStatus {
  @doc("Not yet mitigated")
  Open,

  @doc("The workload recovered; follow-ups may remain")
  Mitigated,

  @doc("Closed, with a postmortem")
  @doc("The incident was closed")
  Resolved,
}

/** Who opened an incident. */
@doc("Who opened an incident")
enum IncidentSource {
  @doc("A person")
  Manual,

  @doc("A monitoring alert posted with an intake key")
  Alert,
}

/** What a timeline entry records. */
@doc("What an incident timeline entry records")
enum IncidentEventKind {
  @doc("The incident was opened")
  Opened,

  @doc("A note from a person, an alert or shep")
  Note,

  @doc("What the workload showed: rollout status, events, logs")
  Evidence,

  @doc("A possible cause, ranked by likelihood")
  Hypothesis,

  @doc("A runtime action was proposed")
  ActionProposed,

  @doc("A runtime action was approved")
  ActionApproved,

  @doc("A runtime action was turned down")
  ActionRejected,

  @doc("A runtime action ran without error")
  ActionSucceeded,

  @doc("A runtime action failed")
  ActionFailed,

  @doc("The workload recovered after an action")
  Recovered,

  @doc("The workload had not recovered after an action")
  NotRecovered,

  Resolved,
}

/** What a runtime action does to the workload. */
@doc("What a runtime action does to the incident's workload")
enum RuntimeActionKind {
  @doc("Restart its pods (rollout restart)")
  Restart,

  @doc("Return to the previous revision (rollout undo)")
  Rollback,

  @doc("Change its replica count")
  Scale,
}

/** Where a runtime action stands. */
@doc("Where a runtime action stands")
enum RuntimeActionStatus {
  @doc("Waiting for a person to approve")
  Proposed,

  @doc("Approved and running")
  Approved,

  @doc("Turned down; it never ran")
  Rejected,

  @doc("Ran without error")
  Succeeded,

  @doc("The command failed")
  Failed,
}

/** Who proposed a runtime action. */
@doc("Who proposed a runtime action")
enum ActionProposer {
  @doc("The triage agent")
  Agent,

  @doc("A person, which also approves it")
  Person,
}

/** Something broke in production. */
@doc("Something broke in production")
model Incident extends BaseEntity {
  @doc("The space the incident belongs to")
  spaceId: string;

  @doc("One-line summary")
  title: string;

  @doc("How bad it is")
  severity: IncidentSeverity;

  @doc("Where it stands")
  status: IncidentStatus;

  @doc("Who opened it")
  source: IncidentSource;

  @doc("The alert text or a person's description")
  detail?: string;

  @doc("Link to the alert, dashboard or report")
  url?: string;

  @doc("The alerting tool's id; a repeat while open adds a note")
  externalId?: string;

  @doc("Kubernetes context of the workload; the current context when unset")
  runtimeContext?: string;

  @doc("Kubernetes namespace of the workload")
  runtimeNamespace?: string;

  @doc("The deployment the incident concerns")
  runtimeWorkload?: string;

  @doc("The Incident signal it raised")
  signalId?: string;

  @doc("When the workload recovered")
  mitigatedAt?: utcDateTime;

  @doc("When it was closed")
  resolvedAt?: utcDateTime;

  @doc("The postmortem, Markdown")
  postmortem?: string;
}

/** One entry on an incident's timeline. */
@doc("One entry on an incident's timeline")
model IncidentEvent {
  @doc("Unique id")
  id: string;

  @doc("The incident")
  incidentId: string;

  @doc("What it records")
  kind: IncidentEventKind;

  @doc("What happened, in words")
  text: string;

  @doc("When")
  createdAt: utcDateTime;
}

/** A restart, rollback or scale of an incident's workload. */
@doc("A restart, rollback or scale of an incident's workload")
model RuntimeAction extends BaseEntity {
  @doc("The incident it answers")
  incidentId: string;

  @doc("What it does")
  kind: RuntimeActionKind;

  @doc("Replica count, for a scale")
  replicas?: int32;

  @doc("Where it stands")
  status: RuntimeActionStatus;

  @doc("Who proposed it")
  proposedBy: ActionProposer;

  @doc("Why")
  reason: string;

  @doc("The command's output or error")
  output?: string;

  @doc("Whether the workload's rollout was ready afterwards")
  recovered?: boolean;

  @doc("When it was approved or rejected")
  decidedAt?: utcDateTime;

  @doc("When it ran")
  executedAt?: utcDateTime;
}
