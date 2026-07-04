# Data Model: agentic-dev-server

> Entity definitions for 103-agentic-dev-server

## Status

- **Phase:** Planning
- **Updated:** 2026-07-04

## Overview

One new TypeSpec model (`DevServerRunPlan`) persisting the agent/deterministic
analysis of how to run a repository's dev server, one new enum
(`RunPlanSource`), and two additive values on the existing `DeploymentState`
enum. No existing entity is modified structurally.

## New Entities

### DevServerRunPlan

**Location:** `tsp/deployment/dev-server-run-plan.tsp`

| Property         | Type            | Required | Description                                                                 |
| ---------------- | --------------- | -------- | --------------------------------------------------------------------------- |
| repoPath         | string          | Yes      | Absolute path of the repository/worktree the plan applies to (primary key)  |
| source           | RunPlanSource   | Yes      | How the plan was produced (Deterministic detection or Agent analysis)       |
| command          | string          | Yes      | Exact command to spawn the dev server                                       |
| cwd              | string          | Yes      | Working directory for the spawn (may be a subdir in monorepos)              |
| packageManager   | string?         | No       | Package manager for installs (npm/pnpm/yarn/bun); absent for non-package stacks |
| expectedPort     | int32?          | No       | Port the server is expected to listen on (verify-node TCP fallback)         |
| language         | string?         | No       | Detected primary language (informational/logging)                           |
| framework        | string?         | No       | Detected framework (informational/logging)                                  |
| setupCommands    | string[]        | Yes      | Ordered one-time setup commands to run before first start (may be empty)    |
| configHash       | string          | Yes      | Hash of the config-file set that produced this plan (cache invalidation)    |
| installStampHash | string?         | No       | Lockfile/manifest hash stamped after the last successful install (staleness) |
| createdAt        | utcDateTime     | Yes      | Creation timestamp                                                          |
| updatedAt        | utcDateTime     | Yes      | Last update timestamp                                                       |

**Relationships:**

- Keyed by `repoPath` — deliberately not a foreign key to `Application`,
  because plans also serve Feature worktrees and bare Repositories (the three
  deployment target types share one plan cache per on-disk path).

**Persistence:** new `dev_server_run_plans` table via an additive migration;
`setup_commands` stored as a JSON text column.

## Modified Entities

None — `Application`, `Feature`, and `Repository` are untouched.

## Value Objects

### RunPlanOverride (application-layer type, not TypeSpec)

**Location:** `packages/core/src/application/ports/output/services/deployment-service.interface.ts`

| Property | Type                     | Description                                  |
| -------- | ------------------------ | -------------------------------------------- |
| command  | string                   | Command to spawn verbatim                    |
| cwd      | string                   | Spawn working directory                      |
| env      | Record<string, string>?  | Additional env vars (applied after scrubbing) |

Passed to `IDeploymentService.start()`; derived from a `DevServerRunPlan`.

## Enums

### RunPlanSource

**Location:** `tsp/deployment/dev-server-run-plan.tsp`

| Value         | Description                                        |
| ------------- | -------------------------------------------------- |
| Deterministic | Plan produced by detectDevScript() without an LLM  |
| Agent         | Plan produced by structured agent analysis         |

### DeploymentState (extended — additive only)

**Location:** `tsp/common/enums/deployment.tsp`

| Value      | Description                                              |
| ---------- | -------------------------------------------------------- |
| Analyzing  | NEW — run plan being resolved (cache/detection/agent)    |
| Installing | NEW — dependencies being installed (log-streamed)        |
| Booting    | Existing — server spawned, waiting for URL/port          |
| Ready      | Existing — URL detected, preview available               |
| Stopped    | Existing — not running (incl. failed runs, with reason in logs) |

---

_Data model changes for TypeSpec compilation_
