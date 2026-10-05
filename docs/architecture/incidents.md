# Incidents and runtime actions

Spec: [`specs/129-incidents`](../../specs/129-incidents/). User guide:
[`docs/guides/incidents.md`](../guides/incidents.md).

## Model

`tsp/domain/entities/incident.tsp` adds `Incident` (space, title, `IncidentSeverity`,
`IncidentStatus` `Open` → `Mitigated` → `Resolved`, `IncidentSource` `Manual` / `Alert`, detail,
url, external id, runtime context / namespace / workload, signal id, mitigated / resolved at,
postmortem), `IncidentEvent` (append-only timeline entries of `IncidentEventKind`) and
`RuntimeAction` (`RuntimeActionKind` `Restart` / `Rollback` / `Scale`, replicas,
`RuntimeActionStatus`, `ActionProposer`, reason, output, recovered). `SpaceAgentSettings` gains
`autoRuntimeActions`. Migration `162-create-incidents` creates `incidents`, `incident_events`
and `runtime_actions`.

## Runtime controller

`IRuntimeController` (`ports/output/services/runtime-controller.interface.ts`) reads evidence,
restarts, rolls back, scales and verifies a `RuntimeTarget`. `KubectlRuntimeController`
(`infrastructure/services/runtime/`) runs `kubectl` without a shell: `rollout restart|undo`,
`scale --replicas`, `rollout status --timeout`, and `get` / `events` / `logs` capped at
`MAX_EVIDENCE_CHARS`. Names are validated in `OpenIncidentUseCase` before they are stored, so
they never start with `-`.

## Use cases (`application/use-cases/incidents/`)

| Use case | Does |
| -------- | ---- |
| `OpenIncidentUseCase` | Validates and stores an incident, appends Opened, records an Incident signal (urgent for Critical/Major); a repeat of an unresolved external id appends a Note |
| `ManageIncidentsUseCase` | Lists, shows (incident, events, actions), notes and resolves; resolving without a postmortem uses `draftPostmortem` |
| `RuntimeActionsUseCase` | Proposes, approves and rejects actions; a Person's action or one in `autoRuntimeActions` (`isAutoApproved`) runs at once, then `verify` within `RECOVERY_TIMEOUT_SECONDS`; the first recovery mitigates an Open incident |
| `TriageIncidentUseCase` | Records evidence, calls `IStructuredAgentCaller` with `triagePrompt` / `TRIAGE_SCHEMA` (no tools, MCP off, the space's agent and environment), records the summary and `rankIncidentHypotheses`, and proposes `parseActionProposal`'s action as the Agent |
| `IngestAlertUseCase` | Verifies the intake key (`feedback/intake-key.ts`), validates the alert and opens an Alert incident |
| `GetIncidentBoardUseCase` | A space's incidents and the selected one in full: the requested one, else the newest unresolved, else the newest |

Pure helpers live in `domain/shared/incidents.ts`.

## Intake

`POST /api/alerts` and `POST /api/feedback` share `handleIntake` (`lib/intake-route.ts`): the
`MAX_INTAKE_BYTES` limit, JSON-object parsing, and the status for each `IntakeRejection`. Both
paths are in `EXTERNALLY_AUTHENTICATED_PATHS`.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| HTTP | `POST /api/alerts` |
| CLI | `shep incident open|ls|show|note|resolve|triage|act|approve|reject`, `shep space config --auto-actions` |
| Web | `/incidents`; Agent settings on `/spaces` |
| DI | `infrastructure/di/modules/register-incidents.ts` |
