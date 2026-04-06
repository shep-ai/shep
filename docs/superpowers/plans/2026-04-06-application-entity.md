# Application Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Application as a first-class domain entity with full DB persistence, canvas node, and full-page view.

**Architecture:** New TypeSpec model → generated types → SQLite migration + repository → use cases → DI wiring → server actions → canvas node component → full-page route with chat panel.

**Tech Stack:** TypeSpec, better-sqlite3, tsyringe DI, React Flow, Next.js App Router, Tailwind CSS, shadcn/ui, Vitest.

---

### Task 1: TypeSpec Domain Model

**Files:**
- Create: `tsp/domain/entities/application.tsp`
- Modify: `tsp/domain/entities/index.tsp`

- [ ] **Step 1: Create the TypeSpec model**

```typespec
// tsp/domain/entities/application.tsp
/**
 * @module Shep.Domain.Entities.Application
 *
 * Defines the Application entity — a Lovable-style persistent workspace
 * where users build apps via conversational AI interaction.
 *
 * Applications are higher-level entities that own one or more repositories
 * and maintain a persistent interactive agent session.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";

/**
 * Application Status
 *
 * Tracks the current state of an Application's agent session.
 */
@doc("Current status of an Application")
enum ApplicationStatus {
  @doc("No active agent session")
  Idle: "Idle",

  @doc("Agent session is running")
  Active: "Active",

  @doc("Last agent session errored")
  Error: "Error",
}

/**
 * Application Entity
 *
 * Represents a persistent workspace for building an app via AI.
 * Each application has a primary repository (auto-created) and
 * optionally links to additional repositories or directories.
 */
@doc("A persistent AI-powered application workspace")
model Application extends SoftDeletableEntity {
  @doc("Human-readable application name")
  name: string;

  @doc("URL-friendly identifier (unique)")
  slug: string;

  @doc("Original user prompt / purpose description")
  description: string;

  @doc("Absolute path to the primary repository")
  repositoryPath: string;

  @doc("Additional linked repository/directory paths (JSON array)")
  additionalPaths: string[];

  @doc("Chosen agent executor type override")
  agentType?: string;

  @doc("Chosen model override")
  model?: string;

  @doc("Current application status")
  status: ApplicationStatus;
}
```

- [ ] **Step 2: Register in entities index**

Add to `tsp/domain/entities/index.tsp`:
```typespec
import "./application.tsp";
```

- [ ] **Step 3: Compile TypeSpec and verify generated output**

Run: `pnpm tsp:compile`
Expected: No errors. `packages/core/src/domain/generated/output.ts` now exports `Application`, `ApplicationStatus`.

- [ ] **Step 4: Commit**

```bash
git add tsp/domain/entities/application.tsp tsp/domain/entities/index.tsp packages/core/src/domain/generated/output.ts
git commit -m "feat(tsp): add application entity and status enum"
```

---

### Task 2: SQLite Migration

**Files:**
- Create: `packages/core/src/infrastructure/persistence/sqlite/migrations/056-create-applications-table.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// packages/core/src/infrastructure/persistence/sqlite/migrations/056-create-applications-table.ts
import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='applications'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE applications (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        slug            TEXT NOT NULL,
        description     TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        additional_paths TEXT NOT NULL DEFAULT '[]',
        agent_type      TEXT,
        model           TEXT,
        status          TEXT NOT NULL DEFAULT 'Idle',
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(applications)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_applications_slug')) {
    db.exec('CREATE UNIQUE INDEX idx_applications_slug ON applications(slug) WHERE deleted_at IS NULL');
  }
  if (!indexNames.has('idx_applications_repository_path')) {
    db.exec(
      "CREATE INDEX idx_applications_repository_path ON applications(REPLACE(repository_path, '\\', '/'))"
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS applications');
}
```

- [ ] **Step 2: Verify migration compiles**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/infrastructure/persistence/sqlite/migrations/056-create-applications-table.ts
git commit -m "feat(domain): add sqlite migration for applications table"
```

---

### Task 3: Database Mapper

**Files:**
- Create: `packages/core/src/infrastructure/persistence/sqlite/mappers/application.mapper.ts`
- Test: `tests/unit/infrastructure/persistence/sqlite/mappers/application.mapper.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/infrastructure/persistence/sqlite/mappers/application.mapper.test.ts
import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type ApplicationRow,
} from '../../../../../../packages/core/src/infrastructure/persistence/sqlite/mappers/application.mapper';

describe('Application Mapper', () => {
  const now = new Date('2026-04-06T12:00:00Z');

  const domainApp = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'My SaaS Platform',
    slug: 'saas-platform',
    description: 'Build a SaaS platform with auth and billing',
    repositoryPath: '/home/user/projects/saas-platform',
    additionalPaths: ['/home/user/repos/shared-lib'],
    agentType: 'claude-code',
    model: 'claude-sonnet-4-6',
    status: 'Idle' as const,
    createdAt: now,
    updatedAt: now,
  };

  const dbRow: ApplicationRow = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'My SaaS Platform',
    slug: 'saas-platform',
    description: 'Build a SaaS platform with auth and billing',
    repository_path: '/home/user/projects/saas-platform',
    additional_paths: '["/home/user/repos/shared-lib"]',
    agent_type: 'claude-code',
    model: 'claude-sonnet-4-6',
    status: 'Idle',
    created_at: now.getTime(),
    updated_at: now.getTime(),
    deleted_at: null,
  };

  it('maps domain object to database row', () => {
    const row = toDatabase(domainApp);
    expect(row).toEqual(dbRow);
  });

  it('maps database row to domain object', () => {
    const app = fromDatabase(dbRow);
    expect(app).toEqual(domainApp);
  });

  it('handles empty additionalPaths', () => {
    const row = toDatabase({ ...domainApp, additionalPaths: [] });
    expect(row.additional_paths).toBe('[]');
    const back = fromDatabase({ ...dbRow, additional_paths: '[]' });
    expect(back.additionalPaths).toEqual([]);
  });

  it('handles undefined optional fields', () => {
    const row = toDatabase({ ...domainApp, agentType: undefined, model: undefined });
    expect(row.agent_type).toBeNull();
    expect(row.model).toBeNull();
  });

  it('handles soft-deleted records', () => {
    const deletedAt = new Date('2026-04-07T00:00:00Z');
    const row = toDatabase({ ...domainApp, deletedAt });
    expect(row.deleted_at).toBe(deletedAt.getTime());
    const back = fromDatabase({ ...dbRow, deleted_at: deletedAt.getTime() });
    expect(back.deletedAt).toEqual(deletedAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/infrastructure/persistence/sqlite/mappers/application.mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the mapper implementation**

```typescript
// packages/core/src/infrastructure/persistence/sqlite/mappers/application.mapper.ts
/**
 * Application Database Mapper
 *
 * Maps between Application domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - additionalPaths stored as JSON string
 */

import type { Application } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the applications table schema.
 */
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  repository_path: string;
  additional_paths: string;
  agent_type: string | null;
  model: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps Application domain object to database row.
 */
export function toDatabase(app: Application): ApplicationRow {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    repository_path: app.repositoryPath,
    additional_paths: JSON.stringify(app.additionalPaths ?? []),
    agent_type: app.agentType ?? null,
    model: app.model ?? null,
    status: app.status,
    created_at: app.createdAt instanceof Date ? app.createdAt.getTime() : app.createdAt,
    updated_at: app.updatedAt instanceof Date ? app.updatedAt.getTime() : app.updatedAt,
    deleted_at: app.deletedAt
      ? app.deletedAt instanceof Date
        ? app.deletedAt.getTime()
        : app.deletedAt
      : null,
  };
}

/**
 * Maps database row to Application domain object.
 */
export function fromDatabase(row: ApplicationRow): Application {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    repositoryPath: row.repository_path,
    additionalPaths: JSON.parse(row.additional_paths) as string[],
    agentType: row.agent_type ?? undefined,
    model: row.model ?? undefined,
    status: row.status as Application['status'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/infrastructure/persistence/sqlite/mappers/application.mapper.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/infrastructure/persistence/sqlite/mappers/application.mapper.ts tests/unit/infrastructure/persistence/sqlite/mappers/application.mapper.test.ts
git commit -m "feat(domain): add application database mapper with tests"
```

---

### Task 4: Repository Port Interface

**Files:**
- Create: `packages/core/src/application/ports/output/repositories/application-repository.interface.ts`
- Modify: `packages/core/src/application/ports/output/repositories/index.ts`

- [ ] **Step 1: Create the interface**

```typescript
// packages/core/src/application/ports/output/repositories/application-repository.interface.ts
/**
 * Application Repository Interface
 *
 * Output port for Application entity persistence operations.
 */

import type { Application } from '../../../../domain/generated/output.js';

export interface IApplicationRepository {
  create(application: Application): Promise<void>;
  findById(id: string): Promise<Application | null>;
  findBySlug(slug: string): Promise<Application | null>;
  findByPath(path: string): Promise<Application | null>;
  list(): Promise<Application[]>;
  update(
    id: string,
    fields: Partial<
      Pick<Application, 'name' | 'status' | 'additionalPaths' | 'agentType' | 'model'>
    >
  ): Promise<void>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

- [ ] **Step 2: Export from barrel**

Add to `packages/core/src/application/ports/output/repositories/index.ts`:
```typescript
export type { IApplicationRepository } from './application-repository.interface.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/application/ports/output/repositories/application-repository.interface.ts packages/core/src/application/ports/output/repositories/index.ts
git commit -m "feat(domain): add application repository port interface"
```

---

### Task 5: SQLite Repository Implementation

**Files:**
- Create: `packages/core/src/infrastructure/repositories/sqlite-application.repository.ts`
- Test: `tests/integration/infrastructure/repositories/sqlite-application.repository.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/infrastructure/repositories/sqlite-application.repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteApplicationRepository } from '../../../../packages/core/src/infrastructure/repositories/sqlite-application.repository';
import type { Application } from '../../../../packages/core/src/domain/generated/output';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE applications (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      slug            TEXT NOT NULL,
      description     TEXT NOT NULL,
      repository_path TEXT NOT NULL,
      additional_paths TEXT NOT NULL DEFAULT '[]',
      agent_type      TEXT,
      model           TEXT,
      status          TEXT NOT NULL DEFAULT 'Idle',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      deleted_at      INTEGER
    )
  `);
  db.exec('CREATE UNIQUE INDEX idx_applications_slug ON applications(slug) WHERE deleted_at IS NULL');
  return db;
}

function makeApp(overrides?: Partial<Application>): Application {
  const now = new Date();
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test App',
    slug: 'test-app',
    description: 'A test application',
    repositoryPath: '/home/user/projects/test-app',
    additionalPaths: [],
    status: 'Idle' as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SQLiteApplicationRepository', () => {
  let db: Database.Database;
  let repo: SQLiteApplicationRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SQLiteApplicationRepository(db);
  });

  it('creates and retrieves an application by id', async () => {
    const app = makeApp();
    await repo.create(app);
    const found = await repo.findById(app.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test App');
    expect(found!.slug).toBe('test-app');
    expect(found!.status).toBe('Idle');
  });

  it('finds by slug', async () => {
    await repo.create(makeApp());
    const found = await repo.findBySlug('test-app');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('finds by path with cross-platform normalization', async () => {
    await repo.create(makeApp());
    const found = await repo.findByPath('/home/user/projects/test-app');
    expect(found).not.toBeNull();
  });

  it('lists non-deleted applications', async () => {
    await repo.create(makeApp({ id: 'id-1', slug: 'app-1' }));
    await repo.create(makeApp({ id: 'id-2', slug: 'app-2' }));
    await repo.softDelete('id-1');
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('id-2');
  });

  it('updates mutable fields', async () => {
    await repo.create(makeApp());
    await repo.update('550e8400-e29b-41d4-a716-446655440000', {
      name: 'Updated Name',
      status: 'Active' as const,
      additionalPaths: ['/extra/path'],
    });
    const found = await repo.findById('550e8400-e29b-41d4-a716-446655440000');
    expect(found!.name).toBe('Updated Name');
    expect(found!.status).toBe('Active');
    expect(found!.additionalPaths).toEqual(['/extra/path']);
  });

  it('soft-deletes and restores', async () => {
    await repo.create(makeApp());
    await repo.softDelete('550e8400-e29b-41d4-a716-446655440000');
    expect(await repo.findById('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
    await repo.restore('550e8400-e29b-41d4-a716-446655440000');
    expect(await repo.findById('550e8400-e29b-41d4-a716-446655440000')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/infrastructure/repositories/sqlite-application.repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository implementation**

```typescript
// packages/core/src/infrastructure/repositories/sqlite-application.repository.ts
/**
 * SQLite Application Repository Implementation
 *
 * Implements IApplicationRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import type { Application } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ApplicationRow,
} from '../persistence/sqlite/mappers/application.mapper.js';

@injectable()
export class SQLiteApplicationRepository implements IApplicationRepository {
  constructor(private readonly db: Database.Database) {}

  async create(application: Application): Promise<void> {
    const row = toDatabase(application);
    const stmt = this.db.prepare(`
      INSERT INTO applications (id, name, slug, description, repository_path, additional_paths, agent_type, model, status, created_at, updated_at)
      VALUES (@id, @name, @slug, @description, @repository_path, @additional_paths, @agent_type, @model, @status, @created_at, @updated_at)
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findBySlug(slug: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE slug = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(slug) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByPath(path: string): Promise<Application | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM applications WHERE REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(path.replace(/\\/g, '/')) as ApplicationRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async list(): Promise<Application[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM applications WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    const rows = stmt.all() as ApplicationRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<Pick<Application, 'name' | 'status' | 'additionalPaths' | 'agentType' | 'model'>>
  ): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (fields.name !== undefined) {
      sets.push('name = @name');
      params.name = fields.name;
    }
    if (fields.status !== undefined) {
      sets.push('status = @status');
      params.status = fields.status;
    }
    if (fields.additionalPaths !== undefined) {
      sets.push('additional_paths = @additional_paths');
      params.additional_paths = JSON.stringify(fields.additionalPaths);
    }
    if (fields.agentType !== undefined) {
      sets.push('agent_type = @agent_type');
      params.agent_type = fields.agentType;
    }
    if (fields.model !== undefined) {
      sets.push('model = @model');
      params.model = fields.model;
    }

    if (sets.length === 0) return;

    sets.push('updated_at = @updated_at');
    params.updated_at = Date.now();

    const stmt = this.db.prepare(
      `UPDATE applications SET ${sets.join(', ')} WHERE id = @id`
    );
    stmt.run(params);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async restore(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE applications SET deleted_at = NULL, created_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/infrastructure/repositories/sqlite-application.repository.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/infrastructure/repositories/sqlite-application.repository.ts tests/integration/infrastructure/repositories/sqlite-application.repository.test.ts
git commit -m "feat(domain): add sqlite application repository with integration tests"
```

---

### Task 6: Use Cases

**Files:**
- Create: `packages/core/src/application/use-cases/applications/create-application.use-case.ts`
- Create: `packages/core/src/application/use-cases/applications/list-applications.use-case.ts`
- Create: `packages/core/src/application/use-cases/applications/get-application.use-case.ts`
- Create: `packages/core/src/application/use-cases/applications/delete-application.use-case.ts`
- Create: `packages/core/src/application/use-cases/applications/update-application.use-case.ts`
- Create: `packages/core/src/application/use-cases/applications/index.ts`
- Test: `tests/unit/application/use-cases/applications/create-application.use-case.test.ts`

- [ ] **Step 1: Write the failing test for CreateApplicationUseCase**

```typescript
// tests/unit/application/use-cases/applications/create-application.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateApplicationUseCase } from '../../../../../packages/core/src/application/use-cases/applications/create-application.use-case';

const mockAppRepo = {
  create: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findById: vi.fn(),
  findByPath: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
};

const mockCreateProject = {
  execute: vi.fn().mockResolvedValue({
    repository: { id: 'repo-1', name: 'saas-platform', path: '/home/user/projects/saas-platform' },
    projectPath: '/home/user/projects/saas-platform',
  }),
};

describe('CreateApplicationUseCase', () => {
  let useCase: CreateApplicationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CreateApplicationUseCase(mockAppRepo as any, mockCreateProject as any);
  });

  it('creates an application with a scaffolded project', async () => {
    const result = await useCase.execute({
      description: 'Build a SaaS platform with auth and billing',
    });

    expect(mockCreateProject.execute).toHaveBeenCalledWith({
      description: 'Build a SaaS platform with auth and billing',
    });
    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        slug: expect.any(String),
        description: 'Build a SaaS platform with auth and billing',
        repositoryPath: '/home/user/projects/saas-platform',
        additionalPaths: [],
        status: 'Idle',
      })
    );
    expect(result.application).toBeDefined();
    expect(result.repositoryPath).toBe('/home/user/projects/saas-platform');
  });

  it('passes agent overrides through', async () => {
    await useCase.execute({
      description: 'Test app',
      agentType: 'cursor',
      model: 'claude-opus-4-6',
    });

    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'cursor',
        model: 'claude-opus-4-6',
      })
    );
  });

  it('appends numeric suffix for duplicate slugs', async () => {
    mockAppRepo.findBySlug
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);

    await useCase.execute({ description: 'Test app' });

    expect(mockAppRepo.findBySlug).toHaveBeenCalledTimes(2);
    expect(mockAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: expect.stringMatching(/-2$/),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/application/use-cases/applications/create-application.use-case.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the use case implementations**

Create `packages/core/src/application/use-cases/applications/create-application.use-case.ts`:
- `@injectable()` class with `@inject('IApplicationRepository')` and `@inject('CreateProjectUseCase')`
- `execute(input: CreateApplicationInput)` → calls `CreateProjectUseCase` to scaffold directory + git init, then creates Application record
- Slug generation: strip stop words, limit to 5 words, join with hyphens
- Name generation: title-case the slug
- Unique slug resolution: check repo, append `-2`, `-3` etc.

Create `packages/core/src/application/use-cases/applications/list-applications.use-case.ts`:
- Simple delegation to `IApplicationRepository.list()`

Create `packages/core/src/application/use-cases/applications/get-application.use-case.ts`:
- Simple delegation to `IApplicationRepository.findById(id)`

Create `packages/core/src/application/use-cases/applications/delete-application.use-case.ts`:
- Stops active interactive session via `IInteractiveSessionService.stop('app-' + id)` (catch errors — session may not exist)
- Then calls `IApplicationRepository.softDelete(id)`

Create `packages/core/src/application/use-cases/applications/update-application.use-case.ts`:
- Simple delegation to `IApplicationRepository.update(id, fields)`

Create `packages/core/src/application/use-cases/applications/index.ts`:
- Barrel export of all five use cases

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/application/use-cases/applications/create-application.use-case.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/use-cases/applications/
git add tests/unit/application/use-cases/applications/
git commit -m "feat(domain): add application use cases - create, list, get, delete, update"
```

---

### Task 7: DI Container Wiring

**Files:**
- Modify: `packages/core/src/infrastructure/di/container.ts`

- [ ] **Step 1: Add imports and registrations**

Add to the imports section (after the existing repository imports near line 24):
```typescript
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import { SQLiteApplicationRepository } from '../repositories/sqlite-application.repository.js';
```

Add to the use case imports section (after line 136):
```typescript
import { CreateApplicationUseCase } from '../../application/use-cases/applications/create-application.use-case.js';
import { ListApplicationsUseCase } from '../../application/use-cases/applications/list-applications.use-case.js';
import { GetApplicationUseCase } from '../../application/use-cases/applications/get-application.use-case.js';
import { DeleteApplicationUseCase } from '../../application/use-cases/applications/delete-application.use-case.js';
import { UpdateApplicationUseCase } from '../../application/use-cases/applications/update-application.use-case.js';
```

Add repository registration (after the IRepositoryRepository registration around line 210):
```typescript
  container.register<IApplicationRepository>('IApplicationRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteApplicationRepository(database);
    },
  });
```

Add use case singletons (after the existing use case registrations around line 426):
```typescript
  container.registerSingleton(CreateApplicationUseCase);
  container.registerSingleton(ListApplicationsUseCase);
  container.registerSingleton(GetApplicationUseCase);
  container.registerSingleton(DeleteApplicationUseCase);
  container.registerSingleton(UpdateApplicationUseCase);
```

Add string-token aliases for web routes (after the existing aliases around line 570):
```typescript
  container.register('CreateApplicationUseCase', {
    useFactory: (c) => c.resolve(CreateApplicationUseCase),
  });
  container.register('ListApplicationsUseCase', {
    useFactory: (c) => c.resolve(ListApplicationsUseCase),
  });
  container.register('GetApplicationUseCase', {
    useFactory: (c) => c.resolve(GetApplicationUseCase),
  });
  container.register('DeleteApplicationUseCase', {
    useFactory: (c) => c.resolve(DeleteApplicationUseCase),
  });
  container.register('UpdateApplicationUseCase', {
    useFactory: (c) => c.resolve(UpdateApplicationUseCase),
  });
```

- [ ] **Step 2: Verify build succeeds**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/infrastructure/di/container.ts
git commit -m "feat(domain): wire application entity into di container"
```

---

### Task 8: Server Actions

**Files:**
- Create: `src/presentation/web/app/actions/create-application.ts`
- Create: `src/presentation/web/app/actions/delete-application.ts`
- Create: `.storybook/mocks/app/actions/create-application.ts`
- Create: `.storybook/mocks/app/actions/delete-application.ts`

- [ ] **Step 1: Create server actions**

`create-application.ts`: `'use server'` function that resolves `CreateApplicationUseCase` via `resolve<>('CreateApplicationUseCase')`, calls `execute({ description, agentType?, model? })`, returns `{ application?, repositoryPath?, error? }`.

`delete-application.ts`: `'use server'` function that resolves `DeleteApplicationUseCase`, calls `execute(id)`, returns `{ error? }`.

Both follow the exact pattern of existing actions like `add-repository.ts` — validate input, resolve use case, try/catch with error message extraction.

- [ ] **Step 2: Create Storybook mocks**

`.storybook/mocks/app/actions/create-application.ts`: Returns a mock Application object.
`.storybook/mocks/app/actions/delete-application.ts`: Returns `{}`.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/web/app/actions/create-application.ts src/presentation/web/app/actions/delete-application.ts .storybook/mocks/app/actions/create-application.ts .storybook/mocks/app/actions/delete-application.ts
git commit -m "feat(web): add application server actions and storybook mocks"
```

---

### Task 9: Application Canvas Node Component

**Files:**
- Create: `src/presentation/web/components/common/application-node/application-node.tsx`
- Create: `src/presentation/web/components/common/application-node/application-node-config.ts`
- Create: `src/presentation/web/components/common/application-node/application-node.stories.tsx`
- Test: `tests/unit/presentation/web/components/common/application-node/application-node.test.tsx`

- [ ] **Step 1: Create the node config**

Define `ApplicationNodeData` interface (id, name, description, status, repositoryPath, additionalPathCount, onClick, onDelete) and `ApplicationNodeType` as `Node<ApplicationNodeData, 'applicationNode'>`.

- [ ] **Step 2: Create the component**

Follow `repository-node.tsx` patterns exactly:
- Card: `bg-card flex w-[26rem] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm dark:bg-neutral-800/80`
- Header row: 32px indigo gradient icon (`LayoutGrid` from lucide, `bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg`) + app name + status dot
- Middle: 120px wireframe placeholder (`bg-muted rounded-lg` with skeleton bars using `bg-muted-foreground/10`)
- Bottom: repo count + status text
- Delete button on hover (same pattern — absolute positioned, circular, trash icon)
- React Flow Handle support

- [ ] **Step 3: Create Storybook stories**

Same wrapper pattern as `repository-node.stories.tsx` — `ApplicationNodeCanvas` component with ReactFlowProvider. Stories: Default, Active, Error, WithDeleteButton, LongName, Multiple.

- [ ] **Step 4: Create unit test**

Test renders name, description, status. Test onClick called on card click. Test onDelete called on delete button click.

- [ ] **Step 5: Run tests and Storybook build**

Run: `pnpm vitest run tests/unit/presentation/web/components/common/application-node/application-node.test.tsx`
Run: `pnpm build:storybook`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/web/components/common/application-node/
git add tests/unit/presentation/web/components/common/application-node/
git commit -m "feat(web): add application canvas node component with stories"
```

---

### Task 10: Canvas Integration — Graph Derivation & State

**Files:**
- Modify: `src/presentation/web/lib/derive-graph.ts`
- Modify: `src/presentation/web/hooks/use-graph-state.ts`
- Modify: `src/presentation/web/components/features/control-center/use-control-center-state.ts`
- Modify: `src/presentation/web/components/features/features-canvas/features-canvas.tsx`
- Modify: server data function (in layout or get-graph-data)

- [ ] **Step 1: Register applicationNode type in features-canvas.tsx**

Add `applicationNode: ApplicationNode` to the `nodeTypes` useMemo.

- [ ] **Step 2: Extend derive-graph.ts**

Add `applicationMap: Map<string, ApplicationEntry>` parameter. For each entry, emit a node with `type: 'applicationNode'`. No edges — application nodes are independent.

- [ ] **Step 3: Extend use-graph-state.ts**

Add `applicationMap` to domain maps. Add `addApplication`, `removeApplication`, `updateApplication` mutators. Wire into reconciliation (same pattern as repoMap).

- [ ] **Step 4: Extend use-control-center-state.ts**

Fetch applications in server data, reconcile into applicationMap. Add `handleDeleteApplication` callback using `deleteApplication` server action.

- [ ] **Step 5: Extend getGraphData to include applications**

Resolve `ListApplicationsUseCase`, build application nodes with position data, include in returned nodes array.

- [ ] **Step 6: Update existing tests if needed**

Any tests that mock `deriveGraph` or `useGraphState` may need the new `applicationMap` parameter.

- [ ] **Step 7: Commit**

```bash
git add src/presentation/web/lib/ src/presentation/web/hooks/
git add src/presentation/web/components/features/control-center/
git add src/presentation/web/components/features/features-canvas/
git commit -m "feat(web): integrate application nodes into canvas graph system"
```

---

### Task 11: FAB "New Application" Action

**Files:**
- Modify: `src/presentation/web/components/features/control-center/control-center-inner.tsx`

- [ ] **Step 1: Add "New Application" to the FAB actions**

Add a new action with `LayoutGrid` icon and "New Application" label. On click, could either:
- Navigate to a new `/create-application` drawer route, or
- Open a simple dialog with a textarea + submit

For simplicity, use a dialog approach (no new route needed).

- [ ] **Step 2: Handle application creation flow**

On submit: call `createApplication` server action → add optimistic node → on success navigate to `/application/:id` → on error remove node + show toast.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/web/components/features/control-center/control-center-inner.tsx
git commit -m "feat(web): add new application action to fab"
```

---

### Task 12: Application Full Page — Route & Layout

**Files:**
- Create: `src/presentation/web/app/application/[id]/page.tsx`
- Create: `src/presentation/web/components/features/application-page/application-page.tsx`
- Create: `src/presentation/web/components/features/application-page/application-page.stories.tsx`

- [ ] **Step 1: Create the page route**

Server component that resolves `GetApplicationUseCase`, fetches the application, returns 404 if not found, otherwise renders `<ApplicationPage application={app} />`.

- [ ] **Step 2: Create the page component**

Split layout with resizable panels:
- Header: Back button (→ `/`), app name, status badge, settings gear
- Left panel (flex-1, min-w-[400px]): Chat component — reuse existing chat infrastructure with scope `app-<id>`. Same `ChatSheet` or inline chat pattern used for feature/repo chat.
- Right panel (flex-1, min-w-[400px]): Tab bar with IDE / Terminal / Web tabs. All three show a "Coming soon" placeholder for this iteration.
- Resizable divider between panels.

- [ ] **Step 3: Create Storybook stories**

Mock the application data and show the split layout with placeholder right panel.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/web/app/application/ src/presentation/web/components/features/application-page/
git commit -m "feat(web): add application full page route with split layout"
```

---

### Task 13: Final Integration — Typecheck, Lint, Full Test Suite

**Files:** None new — verification task.

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 2: Run lint and format**

Run: `pnpm lint:fix && pnpm format:check`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Run Storybook build**

Run: `pnpm build:storybook`
Expected: Builds without errors.

- [ ] **Step 5: Run full build**

Run: `pnpm build`
Expected: Builds without errors.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): resolve lint and type issues from application entity integration"
```
