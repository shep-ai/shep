## Findings

- `WorkItem.stateId` → `WorkItemState.group` (`StateGroup`: Backlog, Unstarted, Started,
  Completed, Cancelled).
- `feedback-themes.ts` exposes the similarity threshold and term sets.
- The daemon already runs discovery on a schedule; outcome checks can share that tick.
