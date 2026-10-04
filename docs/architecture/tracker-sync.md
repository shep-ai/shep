# Tracker sync

Spec: [`specs/122-tracker-sync`](../../specs/122-tracker-sync/). User guide:
[`docs/guides/trackers.md`](../guides/trackers.md).

## Model

`tsp/domain/entities/tracker-sync.tsp`:

| Entity | Purpose |
| ------ | ------- |
| `TrackerConnection` | A Linear or Jira account owned by a space. Its secret is encrypted in the row (`LocalSecretBox`) and only read through `ITrackerConnectionRepository.getSecret`. |
| `TrackerSyncRule` | Keeps a scope (Linear team key or Jira JQL) in a project; direction, interval, cursor and last-run summary. |
| `TrackerIssueLink` | One per synced work item: external id/key/URL plus the title, description, status group and priority both sides had at the last sync. `(connection_id, external_id)` is unique. |
| `ExternalIssue` | A tracker issue in shep's terms, whichever tracker. |

Tables: migration `154-create-tracker-sync`.

## Domain

`domain/shared/tracker-sync.ts` is pure:

- Linear `state.type` and Jira `statusCategory` (+ status name, for cancelled) → `StateGroup`;
  priorities both ways.
- `planIssueSync(direction, snapshot, local, remote)` decides each field: remote-only change →
  apply locally; local-only change → push (two-way); both changed differently → take remote,
  count a conflict.
- `isTrackerRuleDue(rule, now)`.

## Clients

`ITrackerClient` (`application/ports/output/services/tracker-client.interface.ts`) has three
calls: `testConnection`, `searchUpdatedSince(scope, since, page)` and `updateIssue`. Both
implementations sit on an injected `fetch` and share `tracker-http.ts` (timeout, `Retry-After`,
typed `TrackerAuthError` / `TrackerRateLimitError` / `TrackerRequestError`):

- `LinearTrackerClient`: GraphQL at `api.linear.app`, `issues(filter: {team, updatedAt > since})`,
  status write via the team's first `workflowStates` of the group's type.
- `JiraTrackerClient`: REST v3 `POST /search/jql` with `nextPageToken`; "updated since" is
  relative minutes (`updated >= "-62m"`) because absolute JQL dates are read in the Jira user's
  time zone; status write via a transition into the group; descriptions through `adf.ts`
  (ADF ⇄ Markdown).

## Running

`RunTrackerSyncUseCase` runs one rule: page through remote changes, import or reconcile each
issue, then (two-way) push work items edited in shep since their link's last sync whose issue
did not change. The cursor only advances when every page was read, so an interrupted run is
simply repeated (idempotent by external id). A rate limit or rejected credentials stop the run;
other per-issue failures are counted.

`SyncTrackerRulesUseCase` runs due rules (`runDue`) or every enabled rule (`runAll`) one after
another. The daemon (`_serve`) and `shep ui` tick it every minute through `IntervalTask`
(`infrastructure/services/scheduling/interval-task.ts`, shared with the retention scheduler),
which never overlaps runs.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| CLI | `shep connection …`, `shep sync rule …`, `shep sync run` |
| Web | `/connections` (`components/features/trackers/`); issue badge on the work item page |
| DI | `infrastructure/di/modules/register-trackers.ts` |
