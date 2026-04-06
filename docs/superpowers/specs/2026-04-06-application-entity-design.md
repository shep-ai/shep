# Application Entity — Design Spec

## Overview

Introduce **Application** as a first-class domain entity on the control-center canvas. An Application is a Lovable-style persistent workspace: the user describes what they want to build in a prompt, the system scaffolds a local repo, and the user interacts with a long-lived agent session to iteratively build their app. No SDLC ceremony — just chat, build, preview.

## Key Decisions

- **New domain entity** — not a variant of Project or Feature. Own TypeSpec model, repository, use cases.
- **Presentation-agnostic core** — all use cases work for CLI, TUI, and Web. Web is the first consumer; CLI is out of scope for this iteration but the API must support it.
- **Same interactive session infra** — reuses the existing `InteractiveSession` system (polymorphic `featureId` scope key becomes `app-<id>`).
- **Canvas node** — new `applicationNode` type in React Flow, same design system as repo/feature nodes (bg-card, border, shadow-sm). Distinguished by indigo gradient app icon and wireframe screenshot placeholder.
- **Full-page view** — clicking an application node navigates to `/application/:id` (replaces canvas). Split layout: left = chat, right = IDE/Terminal/Web selector.

## Domain Model

### TypeSpec: `tsp/domain/entities/application.tsp`

```typespec
model Application extends SoftDeletableEntity {
  name: string;              // User-given or AI-derived from prompt
  slug: string;              // URL-friendly identifier
  description: string;       // Original user prompt
  repositoryPath: string;    // Primary repo (auto-created)
  additionalPaths: string[]; // Extra linked repos/dirs
  agentType?: string;        // Chosen agent executor
  model?: string;            // Chosen model override
  status: ApplicationStatus; // Current status
}

enum ApplicationStatus {
  Idle,    // No active session
  Active,  // Agent session running
  Error,   // Last session errored
}
```

### Relationships

- **Application → Repository**: The primary `repositoryPath` corresponds to a Repository entity. Additional paths are stored as a JSON array column.
- **Application → InteractiveSession**: Linked via `featureId = "app-<applicationId>"` (polymorphic scope key, same pattern as `repo-<id>` and `global`).
- **Application → Canvas Node**: `applicationNode` type with `nodeId = "app-<applicationId>"`.

## Repository Port

### `IApplicationRepository`

```typescript
interface IApplicationRepository {
  create(application: Application): Promise<void>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  findByPath(path: string): Promise<Application | null>;
  list(): Promise<Application[]>;
  update(id: string, fields: Partial<Pick<Application, 'name' | 'status' | 'additionalPaths' | 'agentType' | 'model'>>): Promise<void>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

## Use Cases

All use cases are `@injectable()` classes following the existing pattern.

### `CreateApplicationUseCase`

**Input**: `{ description: string, agentType?: string, model?: string }`
**Output**: `{ application: Application, repositoryPath: string }`

1. Generate name and slug from description (AI or heuristic).
2. Create a local project directory (reuse `CreateProjectUseCase` logic for scaffolding).
3. Persist the Application record.
4. Return immediately — no agent session started yet (session starts on first chat message).

### `GetApplicationUseCase`

**Input**: `{ id: string }`
**Output**: `Application | null`

Simple lookup by ID.

### `ListApplicationsUseCase`

**Input**: none
**Output**: `Application[]`

Returns all non-deleted applications.

### `DeleteApplicationUseCase`

**Input**: `{ id: string }`
**Output**: void

Soft-deletes the application. Stops any active interactive session.

### `UpdateApplicationUseCase`

**Input**: `{ id: string, fields: Partial<...> }`
**Output**: void

Updates mutable fields (name, additionalPaths, agentType, model).

### `AttachPathToApplicationUseCase`

**Input**: `{ applicationId: string, path: string }`
**Output**: void

Adds a filesystem path to `additionalPaths`. Validates path exists.

### `DetachPathFromApplicationUseCase`

**Input**: `{ applicationId: string, path: string }`
**Output**: void

Removes a path from `additionalPaths`.

## SQLite Persistence

### Migration 056: `056-create-applications-table.ts`

```sql
CREATE TABLE IF NOT EXISTS applications (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  additional_paths TEXT DEFAULT '[]',  -- JSON array of strings
  agent_type      TEXT,
  model           TEXT,
  status          TEXT NOT NULL DEFAULT 'Idle',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_slug ON applications(slug);
CREATE INDEX IF NOT EXISTS idx_applications_repository_path ON applications(REPLACE(repository_path, '\', '/'));
```

### Mapper: `application.mapper.ts`

Standard `toDatabase` / `fromDatabase` pattern. `additionalPaths` serialized as JSON string in DB, parsed to `string[]` in domain.

## Canvas Integration

### New Node Type: `applicationNode`

Registered alongside `featureNode` and `repositoryNode` in `features-canvas.tsx`.

### Node Data: `ApplicationNodeData`

```typescript
interface ApplicationNodeData {
  id: string;
  name: string;
  description: string;
  status: ApplicationStatus;
  repositoryPath: string;
  additionalPathCount: number;
  onClick?: () => void;
  onDelete?: (id: string) => void;
}
```

### Graph Derivation

`deriveGraph` gets a new `applicationMap: Map<string, ApplicationEntry>` alongside existing `featureMap` and `repoMap`. Application nodes are rendered independently — they don't connect to repo/feature edges.

### Domain Map Updates

`useGraphState` and `useControlCenterState` extended with:
- `applicationMap: Map<string, ApplicationEntry>`
- `addApplication()`, `removeApplication()`, `updateApplication()` mutators
- Reconciliation from server props (same pattern as repos)

### Server Data

`getGraphData()` extended to also fetch `ListApplicationsUseCase` and build application nodes.

## Canvas Node Visual Design

Same design system as existing nodes:
- `bg-card` / `dark:bg-neutral-800/80` background
- `border` + `shadow-sm` + `rounded-xl`
- **Differentiators**: Indigo gradient app icon (32x32, rounded-lg), wireframe screenshot placeholder area, repo count chips at bottom, status indicator (green dot = active).
- Width: same as repo node (`w-[26rem]`).

## Full-Page Application View

### Route: `/application/[id]/page.tsx`

Replaces the canvas entirely. Layout:

```
┌──────────────────────────────────────────────────────────┐
│ Header: App name | Back to canvas | Status | Settings    │
├─────────────────────────┬────────────────────────────────┤
│                         │                                │
│   Chat Panel            │   Right Panel                  │
│   (persistent session)  │   ┌──────────────────────┐     │
│                         │   │ [IDE] [Terminal] [Web]│     │
│   Same chat component   │   ├──────────────────────┤     │
│   as feature/repo chat  │   │                      │     │
│                         │   │  Selected view       │     │
│                         │   │                      │     │
│                         │   └──────────────────────┘     │
│                         │                                │
├─────────────────────────┴────────────────────────────────┤
│ (resizable split)                                        │
└──────────────────────────────────────────────────────────┘
```

### Left Panel: Chat

Reuses existing chat components (`ChatSheet` or similar). Session scope: `app-<applicationId>`.

### Right Panel: View Selector

Three tabs:
1. **IDE** — File tree + code viewer (read-only initially, showing the application's repo files)
2. **Terminal** — Embedded terminal for the application's working directory
3. **Web** — iframe/webview pointing to the app's dev server URL

### Implementation Notes

- The right panel views (IDE, Terminal, Web) are complex features. For the initial implementation, we can start with just the chat panel and a placeholder for the right panel, then iterate.
- The split layout should use a resizable panel component (e.g., `react-resizable-panels`).

## Create Application Flow

### From Canvas (FAB)

The existing FAB gets a new action: "New Application" alongside "Local Folder" and "GitHub Import".

1. User clicks "New Application" in FAB.
2. A prompt dialog/drawer opens (similar to the empty state prompt box).
3. User types description, optionally selects agent/model.
4. Calls `createApplication` server action.
5. Optimistic node appears on canvas.
6. On success, navigate to `/application/:id`.

### From Empty State

The existing empty state could offer both "Create Feature" and "Create Application" paths, but this is a future enhancement. For now, the FAB is the entry point.

## Server Actions

### `create-application.ts`

```typescript
'use server'
export async function createApplication(input: {
  description: string;
  agentType?: string;
  model?: string;
}): Promise<{ application?: Application; repositoryPath?: string; error?: string }>
```

### `delete-application.ts`

```typescript
'use server'
export async function deleteApplication(id: string): Promise<{ error?: string }>
```

### `list-applications.ts`

Already handled via `getGraphData()` server function.

## Storybook

Every new component gets a colocated `.stories.tsx`:
- `application-node.stories.tsx` — all visual states (idle, active, error, with/without additional paths)
- `application-page.stories.tsx` — full page layout with chat + right panel placeholder

## Out of Scope (This Iteration)

- CLI commands for applications
- Right panel IDE/Terminal/Web implementation (placeholder only)
- Real app preview (dev server management)
- Application settings/configuration page
- Multi-repo orchestration logic
- Application templates/scaffolding beyond basic directory creation
