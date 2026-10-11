# Data Model: decision-telemetry

> Entity definitions for 135-decision-telemetry

## Status

- **Phase:** Implementation
- **Updated:** 2026-10-11

## Overview

No new entities and no persistence changes. Three enum additions in TypeSpec type the decision
telemetry events.

## New Enums

### DecisionSurface

**Location:** `tsp/agents/decision.tsp`

| Value        | Meaning                                         |
| ------------ | ----------------------------------------------- |
| `web`        | Answered in the web UI (inbox, drawer)          |
| `cli`        | Answered with `shep agent questions answer`     |
| `chat`       | Answered in a chat session's inline panel       |
| `supervisor` | Answered by the supervisor agent                |
| `other`      | Caller did not say                              |

## Modified Enums

### DecisionOutcome

**Location:** `tsp/agents/decision.tsp`

| Change | Description |
| ------ | ----------- |
| `Disabled: "disabled"` | The collaboration flag was off, so the recommendation was used without asking |

### TelemetryEvent

**Location:** `tsp/common/enums/telemetry.tsp`

| Change | Description |
| ------ | ----------- |
| `DecisionDefaulted: "decision.defaulted"` | An agent-asked decision reached its deadline and the recommendation was applied |

## Event Properties

| Event | Properties |
| ----- | ---------- |
| `decision.answered` | `kind: DecisionKind`, `surface: DecisionSurface`, `latency: DurationBucket`, `pickedRecommended: boolean` |
| `decision.defaulted` | `kind: DecisionKind`, `timeout: DurationBucket` |
