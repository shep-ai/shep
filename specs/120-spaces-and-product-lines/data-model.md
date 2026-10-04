# Data Model: spaces-and-product-lines

> Entity definitions for 120-spaces-and-product-lines

## Status

- **Phase:** Implementation
- **Updated:** 2026-10-04

## Overview

A **Space** is a hard knowledge boundary. A **ProductLine** groups repositories inside one space.
Repositories are mapped to a space (and optionally a line) by **SpaceRule**s or by an explicit
**RepositorySpaceAssignment**, keyed by normalised repository path. **ProjectMemory** gains the
space and line it belongs to.

## New Entities

| Entity | Fields | Notes |
| --- | --- | --- |
| Space | id, name, slug (unique), description?, color?, isDefault | one default, created by migration 152 with `DEFAULT_SPACE_ID` |
| ProductLine | id, spaceId, name, slug (unique per space), description? | |
| SpaceRule | id, spaceId, productLineId?, kind (Path \| Remote), pattern, priority | most specific match wins; ties by lower priority |
| RepositorySpaceAssignment | repositoryPath (PK), spaceId, productLineId?, createdAt, updatedAt | beats every rule |

## Changed Entities

| Entity | Change |
| --- | --- |
| ProjectMemory | `spaceId?`, `productLineId?` |
| MemoryScope | adds `Space`, `ProductLine`; `Organization` kept and read as `Space` |

## New Enums

- `SpaceRuleKind`: `Path`, `Remote`
- `SpaceResolutionSource`: `Assignment`, `Rule`, `Default`

## Tables (migration 152)

- `spaces(id PK, name, slug UNIQUE, description, color, is_default, created_at, updated_at)`
- `product_lines(id PK, space_id, name, slug, description, created_at, updated_at)`, UNIQUE `(space_id, slug)`
- `space_rules(id PK, space_id, product_line_id, kind, pattern, priority, created_at, updated_at)`
- `repository_space_assignments(repository_path PK, space_id, product_line_id, created_at, updated_at)`
- `project_memory` adds `space_id`, `product_line_id`; existing rows backfilled to the default space
