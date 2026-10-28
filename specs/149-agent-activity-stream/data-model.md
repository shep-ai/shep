# Data Model: agent-activity-stream

No entities, tables or migrations. Two derived-only enums in `tsp/common/enums/agent-activity.tsp`:

## AgentActivityState

| Member  | Value     | Meaning                                                        |
| ------- | --------- | -------------------------------------------------------------- |
| Working | `working` | An agent is executing                                          |
| Blocked | `blocked` | The user must act: an approval gate, an agent question, a review |
| Waiting | `waiting` | Not started: queued for a slot, deferred, or waiting on a parent |
| Done    | `done`    | Finished (or archived)                                         |
| Failed  | `failed`  | The run failed, was interrupted or cancelled, or its process died |

## FeatureStateReason

The branch of `explainFeatureState` that decided a feature's state, plus `agent-question`
(added by the activity mapping when a non-gate agent question is pending).

## AgentActivity (application type, not persisted)

`featureId`, `name`, `repositoryPath`, `state`, `reason`, `featureState`, `lifecycle`, `phase`,
`runId?`, `runStatus?`, `pendingQuestion? { id, appId, prompt }`, `pendingQuestions`, `error?`,
`pr?`, `version` (epoch ms), `changedAt`.
