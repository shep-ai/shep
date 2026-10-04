/**
 * @module Shep.Domain.Entities.TrackerSync
 *
 * Tracker sync (spec 122): the rules that keep an issue tracker scope (Linear
 * team, Jira query) in a shep project, and the links between a work item and
 * the issue it came from. The tracker account is a Connection.
 */
import "../../common/base.tsp";
import "./connection.tsp";
import "../../common/enums/work-item-enums.tsp";

/** Which way a sync rule moves changes. */
@doc("Which way a tracker sync rule moves changes")
enum TrackerSyncDirection {
  @doc("Tracker changes are applied to shep; shep changes stay local")
  Import,

  @doc("Changes flow both ways; a field changed on both sides takes the tracker's value")
  TwoWay,
}

/** What one run of a sync rule did. */
@doc("What one run of a tracker sync rule did")
model TrackerSyncRunSummary {
  @doc("Work items created from new issues")
  created: int32;

  @doc("Work items updated from tracker changes")
  updated: int32;

  @doc("Issues updated from shep changes (two-way rules)")
  pushed: int32;

  @doc("Fields changed on both sides; the tracker's value was kept")
  conflicts: int32;

  @doc("Issues that could not be synced this run")
  failed: int32;

  @doc("Whether the tracker rate-limited the run before it finished")
  rateLimited: boolean;
}

/** Keeps one tracker scope in one shep project. */
@doc("Keeps one tracker scope (Linear team or Jira JQL) in one shep project")
model TrackerSyncRule extends BaseEntity {
  @doc("The connection to read and write")
  connectionId: string;

  @doc("The shep project issues become work items in")
  projectId: string;

  @doc("Linear team key (for example ENG) or Jira JQL query")
  scope: string;

  @doc("Import only, or two-way")
  direction: TrackerSyncDirection;

  @doc("Minutes between automatic runs")
  intervalMinutes: int32;

  @doc("Whether the daemon runs this rule")
  enabled: boolean;

  @doc("Newest tracker update time applied; the next run asks for issues updated after it")
  cursor?: utcDateTime;

  @doc("When the rule last ran")
  lastRunAt?: utcDateTime;

  @doc("What the last run did")
  lastRun?: TrackerSyncRunSummary;

  @doc("Why the last run failed, when it did")
  lastError?: string;
}

/** A work item's tracker issue and the values last synced. */
@doc("Links a work item to a tracker issue, with the values both sides had at the last sync")
model TrackerIssueLink {
  @doc("The linked work item; one link per work item")
  workItemId: string;

  @doc("The rule that created the link")
  ruleId: string;

  @doc("The connection of that rule")
  connectionId: string;

  @doc("The tracker's id for the issue")
  externalId: string;

  @doc("The human key such as ENG-42 or PAY-7")
  externalKey: string;

  @doc("Link to the issue in the tracker")
  externalUrl: string;

  @doc("Title at the last sync")
  syncedTitle: string;

  @doc("Description at the last sync")
  syncedDescription?: string;

  @doc("Status group at the last sync")
  syncedStateGroup: StateGroup;

  @doc("Priority at the last sync")
  syncedPriority: Priority;

  @doc("The tracker's update time at the last sync")
  remoteUpdatedAt: utcDateTime;

  @doc("When the link was created")
  createdAt: utcDateTime;

  @doc("When the link was last synced")
  updatedAt: utcDateTime;
}

/** A tracker issue in shep's terms, whichever tracker it came from. */
@doc("A tracker issue in shep's terms, whichever tracker it came from")
model ExternalIssue {
  @doc("The tracker's id")
  externalId: string;

  @doc("The human key such as ENG-42")
  key: string;

  @doc("Link to the issue")
  url: string;

  title: string;

  @doc("Markdown description")
  description?: string;

  @doc("The tracker status, mapped to shep's status group")
  stateGroup: StateGroup;

  @doc("The tracker's own status name")
  stateName: string;

  priority: Priority;

  @doc("When the tracker last changed the issue")
  updatedAt: utcDateTime;
}
