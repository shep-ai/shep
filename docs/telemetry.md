# Usage Metrics (Telemetry)

Shep sends a small set of **usage events** to the Shep team so we can tell which parts of Shep
are used and whether runs end in merged pull requests. It is on by default, announced the first
time you run Shep, and easy to turn off. This page lists everything that is sent.

Spec: [`specs/133-telemetry`](../specs/133-telemetry/spec.md).

## Turning it off

| How | Effect |
| --- | ------ |
| `shep telemetry off` | Off; events not yet sent are deleted |
| Settings → Usage metrics → *Send usage metrics* | Same as above |
| Web onboarding → *Turn off* | Same as above |
| `DO_NOT_TRACK=1` or `SHEP_TELEMETRY_DISABLED=1` | Off for every process that sees the variable |
| `CI` set (any value except `0`/`false`) | Always off |
| Running under a test runner (`VITEST`, `NODE_ENV=test`) | Always off |

`shep telemetry identity off` keeps metrics but leaves out every identity field.
`shep telemetry contact on|off` sets whether the Shep team may contact you on GitHub.
`shep telemetry status` shows the current state; `shep telemetry show` prints the exact request
body the next send would post (with the project key replaced by a placeholder).

## What is sent

Every event carries:

| Field | Example | Notes |
| ----- | ------- | ----- |
| `distinct_id` | random UUID | The install id, created on first run. Never derived from an account. |
| `uuid` | random UUID | Per event; retries reuse it so the backend can drop copies. |
| `process` | `cli` / `daemon` / `worker` | Which Shep process recorded it. |
| `shepVersion`, `os`, `arch`, `nodeVersion` | `1.236.0`, `darwin`, `arm64`, `22.11.0` | |
| `contactConsent` | `false` | Whether the Shep team may contact you on GitHub (off unless you allow it). |
| `$geoip_disable` | `true` | PostHog's GeoIP enrichment is always off. |

Unless **Include my identity** is off, events also carry:

| Field | Source |
| ----- | ------ |
| `agentAccountHash`, `agentAccountSource` | SHA-256 of `<agentType>:<accountId>`, read from the agent's own login file through its catalog entry (Claude: `~/.claude.json` `userID`, honouring `CLAUDE_CONFIG_DIR`; Codex: `~/.codex/auth.json` `tokens.account_id`, honouring `CODEX_HOME`). The raw id never leaves the reader. |
| `githubUsername` | `gh api user` |
| `githubOwners` | The GitHub owners (users or organisations) parsed from the remotes of repositories added to Shep. Repository names are dropped. |

With identity on, PostHog creates a person profile for the install with `githubUsername`,
`githubOwners` and `contactConsent`; with identity off, person profiles are not processed.

### Events

| Event | Properties | Recorded by |
| ----- | ---------- | ----------- |
| `install.heartbeat` | `agentType`, `enabledFeatureFlags` (flag names), `repositoryCount`, `activeFeatureCount` | Daemon, at most once a day |
| `cli.command` | `command` — the command path such as `feat new`, never arguments | CLI |
| `web.area.viewed` | `area` (`/aspm`), `route` — a route template such as `/feature/[featureId]` | Web UI |
| `feature.created` | `buildMode`, `agentType` | `CreateFeatureUseCase` |
| `feature.run.finished` | `status`, `agentType`, `duration` (bucket: `under-1m` … `over-4h`) | Feature-agent worker |
| `pr.opened` | `buildMode` | Merge node (once per feature) |
| `pr.merged` | `buildMode`, `viaPullRequest` | Merge node, PR sync, GitHub webhook (once per feature) |
| `decision.answered` | `kind`, `surface`, `latency` (bucket), `pickedRecommended` | Defined for the unified-decisions work |
| `onboarding.step` | `step`, `completed` | Web onboarding |
| `error.unhandled` | `errorClass`, `sourceHash` (truncated SHA-256 of the top stack frame's `function@file:line`) | CLI, daemon, worker crash handlers |

**Never sent:** prompts, code, file paths, repository or branch names, feature titles, local ids,
or error messages. Property types are declared per event (`TelemetryEventPropertyMap` in
`packages/core/src/application/ports/output/services/telemetry-events.ts`), so a content property
does not compile.

The north-star metric is **merged PRs per weekly-active install**.

## How it is delivered

```
any process ── ITelemetry.record() ──► SQLite telemetry_outbox ──► daemon / shep ui flush (60s)
                (drops when off)        (uuid, attempts, cap 5000)     │
                                                                       ├─ off?  → delete everything queued
                                                                       ├─ no key? → wait
                                                                       └─ POST https://eu.i.posthog.com/batch/
```

- Every process writes to the local `telemetry_outbox` table; only the long-lived server
  process (the `shep start` daemon or `shep ui`) sends.
- Batches of 20 are claimed with a two-minute lease, so two server processes never send the same
  events.
- A failed batch backs off with jitter (2 s doubling to 5 min) and is dropped after 5 attempts.
- The outbox keeps at most 5,000 events.
- Identity is attached when a batch is sent, so turning identity off also covers events queued
  before.
- Plain `fetch`, no SDK.

## Configuration (maintainers)

| Setting | Where |
| ------- | ----- |
| Project key | `SHEP_POSTHOG_KEY`, else `BUILT_IN_POSTHOG_KEY` in `packages/core/src/infrastructure/services/telemetry/telemetry-config.ts` (empty in source: no key, nothing is sent) |
| Host | `SHEP_POSTHOG_HOST`, default `https://eu.i.posthog.com` |

In the PostHog project, also turn on **Discard client IP data**, since the capture endpoint
otherwise records the sender's IP address.

## Code map

| Layer | Files |
| ----- | ----- |
| TypeSpec | `tsp/common/enums/telemetry.tsp`, `TelemetryConfig` in `tsp/domain/entities/settings.tsp` |
| Domain | `packages/core/src/domain/shared/telemetry/` |
| Ports | `ITelemetry`, `ITelemetryTransport`, `ITelemetryIdentityProvider`, `ITelemetryRuntime`, `ITelemetryOutboxRepository` |
| Use cases | `packages/core/src/application/use-cases/telemetry/` |
| Adapters | `packages/core/src/infrastructure/services/telemetry/`, migration `166-create-telemetry.ts` |
| CLI | `src/presentation/cli/commands/telemetry/`, `src/presentation/cli/telemetry-hooks.ts` |
| Web | `src/presentation/web/components/features/telemetry/`, `app/actions/telemetry.ts`, `hooks/use-route-view-telemetry.ts` |
