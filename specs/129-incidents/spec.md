## Problem Statement

- Shep deploys and forgets: an alert at night reaches a person with no context and no help.
- The cluster service can apply manifests and list pods, but cannot read logs or events,
  restart, roll back or scale a workload.
- Incidents never reach the opportunity board, so the same outage can repeat.

## Product Shape

- **Incident** (space): title, severity (Critical, Major, Minor), status (Open, Mitigated,
  Resolved), source (Manual, Alert), detail, link, the workload it concerns (Kubernetes
  context, namespace, deployment), the external id of the alert, the signal it raised, and the
  postmortem.
- **Timeline**: Opened, Note, Evidence, Hypothesis, ActionProposed, ActionApproved,
  ActionRejected, ActionSucceeded, ActionFailed, Recovered, NotRecovered, Resolved — each with
  text and time.
- **Runtime action**: restart, rollback or scale (with replicas) of the incident's workload;
  status Proposed, Approved, Rejected, Succeeded, Failed; who proposed it (agent or person), why,
  the command output, and whether the workload recovered.
- **Policy**: a space's agent settings list the action kinds shep may run without asking
  (none by default). A person proposing an action approves it.
- **Triage**: evidence from the workload (rollout status, recent events, logs tail), the agent's
  summary, ranked hypotheses and at most one proposed action, recorded on the timeline.
- **Alerts**: `POST /api/alerts` with a space intake key (the keys feedback uses) opens an
  incident; the same external id while it is open adds a note instead.
- **Postmortem**: on resolve, a Markdown postmortem from the timeline (summary, impact window,
  timeline, actions, follow-ups) unless one is given.

## User Flows

**F1. Alert.** Alertmanager posts to `/api/alerts`; an Open incident and an urgent Incident
signal appear in the space.

**F2. Triage.** `shep incident triage <id>` (or **Triage** on the Incidents page) reads the
workload and records hypotheses and a proposed rollback. The space allows restarts only, so
the rollback waits.

**F3. Act.** `shep incident approve <action>` runs the rollback; shep waits for the rollout,
records Recovered and marks the incident Mitigated. `shep incident resolve <id>` writes the
postmortem.

## Success Criteria

- [ ] Only the space's allowed action kinds run without approval; a rejected action never
      runs; every action and its outcome is on the timeline.
- [ ] Recovery is checked after each action and moves the incident to Mitigated only when the
      rollout is ready.
- [ ] An alert with a valid key opens one incident per open external id and raises one urgent
      Incident signal; a bad key is refused.
- [ ] Triage without a workload still records the agent's hypotheses; a failing agent leaves a
      Note, not a broken incident.
- [ ] CLI and web cover open, triage, act, resolve and the policy; strings in 9 locales; stories
      for every new component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Medium | Incident, IncidentEvent, RuntimeAction and enums; space auto actions |
| Persistence | Medium | Migration 162 |
| Infrastructure | Medium | kubectl runtime controller (status, events, logs, restart, undo, scale) |
| Application | High | Open, triage, decide, execute and verify, resolve, alerts |
| Presentation | High | `shep incident`, /incidents page, alert endpoint, policy setting |

## Dependencies

- Specs 121 (space agent settings), 126 (signals), 127 (intake keys).

## Out of Scope

- Runtimes other than Kubernetes deployments (Argo CD, serverless): the controller port admits
  them as adapters.
- Paging people and on-call rotations.

## Size Estimate

**L**: 12 tasks.
