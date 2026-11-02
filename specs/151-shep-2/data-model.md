# Data Model: shep-2

> Entity definitions for 151-shep-2

## Status

- **Phase:** Implementation
- **Updated:** 2026-11-01

## Overview

Shep 2's domain is Rust (`shep2/crates/shep-domain`), not TypeSpec: the Rust types are the
source of truth, and client types (Swift) will be generated from the OpenRPC schema. Every
branching concept is an enum.

## Entities

### Task

**Location:** `shep2/crates/shep-domain/src/task.rs`

| Property | Type | Required | Description |
| -------- | ---- | -------- | ----------- |
| id | TaskId (i64) | Yes | Assigned by the store |
| title | String | Yes | From the source; enriched when the source is read |
| source | TaskSourceRef | Yes | Where the task came from |
| state | TaskState | Yes | One of the five states |
| question | Option<String> | No | What the agent is waiting on while the task needs you |
| note | Option<String> | No | The latest answer or send-back note |
| created_at / updated_at | UnixTime | Yes | Seconds since the epoch |

## Enums and Value Objects

| Name | Values |
| ---- | ------ |
| TaskState | Queued, Working, NeedsYou, Ready, Merged (allowed moves: Queued→Working, Working→NeedsYou/Ready, NeedsYou→Working, Ready→Working/Merged) |
| TaskSourceRef | GitHubIssue{repo?, number}, Linear{key}, Jira{key}, Notion{url}, Monday{url}, Slack{url}, Sentence{text} |
| SourceKind | GitHub, Linear, Jira, Notion, Monday, Slack, Shep |
| ReviewAction | Merge, SendBack{note}, Answer{text} |
| AgentKind | ClaudeCode, Codex, Gemini |
| ClockTime | hour, minute |
| Settings | agent?, shift_start (default 23:00), parallelism (default 3, 1–12) |

## Storage

SQLite at `$SHEP_HOME/shep2.db`: `tasks` (one row per task; source stored as JSON, state by
enum name) and `settings` (one JSON row). Schema version in `PRAGMA user_version`. Runs and
events tables arrive with agent runs (task-7).
