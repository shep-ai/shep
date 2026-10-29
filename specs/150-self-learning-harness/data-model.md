# Data Model: self-learning-harness

> Entity definitions for 150-self-learning-harness

## Status

- **Phase:** Planning
- **Updated:** 2026-10-28

## Overview

A learned harness is a versioned overlay of components scoped like Shep Brain memory
(repository, space or product line). Exactly one version per scope is Adopted; Candidates
come from reflection or exploration and become decisions. Each refinement writes edit records
(what each component change did, with a verdict) and at most one lesson for future
improvers. Outcome rows tie finished features to the version they ran on.

## New Enums (`tsp/common/enums/learned-harness.tsp`)

| Enum | Members |
| --- | --- |
| HarnessComponentKind | Instructions, Guardrails, Memory, ToolGuidance, Skill, Script, Subagent, Hook |
| LearnedHarnessStatus | Candidate, Adopted, Rejected, RolledBack, Superseded |
| HarnessOrigin | Base, Reflect, Explore, Manual |
| HarnessEditDimension | Inv, Dom, Compose |
| HarnessEditVerdict | Helped, Hurt, NoObservedEffect, Confounded, Untested |
| LessonConfidence | High, Medium, Low |
| LearningMode | Off, Reflect, Explore |
| HarnessAdoptionPolicy | Manual, AutoTextOnly, Auto |

## New Entities (`tsp/domain/entities/learned-harness.tsp`)

### LearnedHarnessVersion

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| id | UUID | yes | Version id |
| scope | MemoryScope | yes | Project, Space or ProductLine |
| repositoryPath | string | no | Set for Project scope |
| spaceId / productLineId | UUID | no | Set for Space / ProductLine scope |
| parentVersionId | UUID | no | Version this one was derived from; rollback target |
| status | LearnedHarnessStatus | yes | Lifecycle |
| origin | HarnessOrigin | yes | How it was produced |
| components | HarnessComponent[] | yes | The overlay (empty for Base) |
| notes | string | no | Composer notes: each decision with its trajectory moment |
| sourceFeatureId | UUID | no | Feature whose run produced it |
| refinementRunId | UUID | no | Refinement that produced it |

### HarnessComponent (value object)

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| kind | HarnessComponentKind | yes | Component kind |
| path | string | yes | Path on the surface, e.g. `skills/db-migration/SKILL.md` |
| content | string | yes | File content |
| sha256 | string | yes | Content hash for diff and provenance |

### HarnessEditRecord

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| id | UUID | yes | |
| versionId | UUID | yes | Candidate the edit belongs to |
| refinementRunId | UUID | yes | |
| dimension | HarnessEditDimension | yes | INV, DOM or Compose |
| componentPath | string | yes | Changed component |
| change | string | yes | What the edit did |
| observed | string | yes | Execution difference and where it was seen |
| verdict | HarnessEditVerdict | yes | Untested for reflect-only edits |

### HarnessLesson

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| id | UUID | yes | |
| scope fields | as on the version | yes | Same isolation as the version |
| cue | string | yes | Shape of situation the lesson applies to |
| lesson | string | yes | Operation on a harness, naming the component |
| evidence | string | yes | Edit rows and contrast it rests on |
| confidence | LessonConfidence | yes | Capped at Low when every row is Untested |
| sourceFeatureId | UUID | yes | |
| versionId | UUID | yes | |

### HarnessRefinementRun

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| id | UUID | yes | |
| featureId | UUID | yes | |
| mode | LearningMode | yes | Reflect or Explore |
| recursion | string enum (parallel, sequential) | no | Explore only |
| k | int32 | yes | Budget; 0 for Reflect |
| rollouts / sessions | int32 | yes | Ledger counts (4k / 3k in Explore) |
| costUsd | float64 | yes | Total improvement + probe cost |
| chosenLabel / selectionReason | string | no | Blind selection result |
| status | string enum (succeeded, kept-base, fell-back, failed, over-budget) | yes | |

### HarnessVersionOutcome

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| versionId | UUID | yes | Version the feature ran on |
| featureId | UUID | yes | |
| ciFixAttempts, gateRejections, validationRepairs, numTurns | int32 | yes | |
| costUsd | float64 | yes | |
| toolErrorRate | float64 | no | When the transcript allows it |
| merged | boolean | yes | |

## Modified Entities

### Settings

- Add: `featureFlags.selfLearning: boolean` (default false)
- Add: `learning: LearningConfig` — mode (Off), exploreK (1), exploreMaxCostUsd, adoptionPolicy
  (Manual), alwaysOnCharCap (4000), regressionMinSample (5)

### Feature

- Add: `exploreHarness?: boolean` — run this feature in Explore mode regardless of the scope
  mode
- Add: `exploreK?: int32` — Explore budget for this feature (falls back to `learning.exploreK`)

### Decision

- Add: `DecisionKind.HarnessChange` with a payload referencing the candidate version

### AgentDescriptor (`domain/shared/agent-catalog.ts`)

- Add: harness surface family, so installers are chosen from the catalog and never by
  hardcoded agent type
