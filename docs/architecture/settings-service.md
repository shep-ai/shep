# Settings Service Architecture

Architecture documentation for the global settings service implementation.

## Overview

The Settings Service provides global application configuration accessible throughout the CLI. It implements a singleton pattern with SQLite persistence, using Clean Architecture principles and dependency injection.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ CLI Entry Point (src/presentation/cli/index.ts)            │ │
│  │                                                             │ │
│  │  async function bootstrap() {                              │ │
│  │    1. initializeContainer() → DI setup + migrations        │ │
│  │    2. container.resolve(InitializeSettingsUseCase)         │ │
│  │       initializeSettings(settings) → Singleton             │ │
│  │    3. initI18n(settings.user.preferredLanguage)            │ │
│  │    4. program.parseAsync() → Command execution             │ │
│  │  }                                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ InitializeSettingsUseCase                                 │  │
│  │   execute() → Settings                                    │  │
│  │   - Load existing settings OR                             │  │
│  │   - Create defaults + persist                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Port: ISettingsRepository                                 │  │
│  │   initialize(settings): Promise<void>                     │  │
│  │   load(): Promise<Settings | null>                        │  │
│  │   update(settings): Promise<void>                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SQLiteSettingsRepository                                  │  │
│  │   @injectable() (tsyringe DI)                             │  │
│  │   constructor(db: Database.Database)                      │  │
│  │   - Uses prepared statements (SQL injection safe)         │  │
│  │   - Delegates to SettingsMapper for DB ↔ TS conversion    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SettingsMapper (settings.mapper.ts)                       │  │
│  │   toDatabase(settings): SettingsRow                       │  │
│  │   fromDatabase(row): Settings                             │  │
│  │   - Flattens nested objects (models.default → model_default)  │
│  │   - Converts types (boolean → integer, Date → ISO string) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SQLite Database (~/.shep/data)                            │  │
│  │   Table: settings (singleton constraint on 'id')          │  │
│  │   Columns: snake_case (model_default, sys_log_level, ...)  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                               ↑
┌─────────────────────────────────────────────────────────────────┐
│                      Singleton Service                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ settings.service.ts                                       │  │
│  │   globalThis['__shepSettings'] (+ process fallback)       │  │
│  │                                                           │  │
│  │   initializeSettings(settings): void                      │  │
│  │   getSettings(): Settings                                 │  │
│  │   hasSettings(): boolean                                  │  │
│  │   updateSettings(settings): void                          │  │
│  │   resetSettings(): void                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Usage:                                                          │
│    import { getSettings } from '@/infrastructure/services/settings.service'; │
│    const settings = getSettings();                               │
│    console.log(settings.models.default); // 'claude-sonnet-4-6'  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. TypeSpec-First Domain Model

**Decision:** Define Settings in TypeSpec, generate TypeScript types.

**Rationale:**

- Single source of truth for domain model
- Automatic OpenAPI spec generation for future API
- Type safety enforced at compile time
- Easy to evolve (change `.tsp` → regenerate types)

**Implementation:**

```typescript
// Generated: packages/core/src/domain/generated/output.ts
export type Settings = BaseEntity & {
  models: ModelConfiguration;
  user: UserProfile;
  environment: EnvironmentConfig;
  system: SystemConfig;
  agent: AgentConfig;
  notifications: NotificationPreferences;
  workflow: WorkflowConfig;
  featureFlags?: FeatureFlags;
  onboardingComplete: boolean;
  interactiveAgent?: InteractiveAgentConfig;
  fabLayout?: FabLayoutConfig;
  supervisor?: SupervisorConfig;
  defaultHomePage?: DefaultHomePage;
  whatsapp?: WhatsAppConfig;
  security?: SecurityConfig;
  messaging?: MessagingConfig;
  worktree?: WorktreeConfig;
};

export type ModelConfiguration = {
  default: string; // Default model identifier for all agents
  adaptive?: AdaptiveModelConfig; // Per-task model tier routing (spec 110)
};
```

The full field list lives in
[../api/domain-models.md](../api/domain-models.md); the TypeSpec source is
`tsp/domain/entities/settings.tsp`.

**Trade-offs:**

- ✅ Type safety across application
- ✅ API documentation auto-generated
- ✅ Easy schema evolution
- ❌ Requires TypeSpec compilation step
- ❌ Generated code must be committed

### 2. Singleton Pattern (Application-Level)

**Decision:** Global singleton service for settings access.

**Rationale:**

- Settings are global by nature (apply to entire CLI session)
- Avoid passing settings through every function call
- Initialization happens once at CLI bootstrap
- Predictable lifecycle (init → use → exit)

**Implementation:**

The instance is stored under a `__shepSettings` key on `globalThis` (with
`process` as a fallback) rather than in a module-level variable. That is
deliberate: a module-level `let` is lost whenever Turbopack re-evaluates the
module inside a Next.js API route, which would make `getSettings()` throw in the
web UI.

```typescript
// packages/core/src/infrastructure/services/settings.service.ts
const SHEP_SETTINGS_KEY = '__shepSettings';

export function initializeSettings(settings: Settings): void {
  if (readSettings() !== null) {
    throw new Error('Settings already initialized. Cannot re-initialize.');
  }
  writeSettings(settings);
}

export function getSettings(): Settings {
  const instance = readSettings();
  if (instance === null) {
    throw new Error('Settings not initialized. Call initializeSettings() during CLI bootstrap.');
  }
  return instance;
}

/** Refresh the singleton after a successful database write. */
export function updateSettings(settings: Settings): void {
  if (readSettings() === null) {
    throw new Error('Settings not initialized. Cannot update before initialization.');
  }
  writeSettings(settings);
}
```

`hasSettings()` reports initialization without throwing. `resetSettings()` clears
the instance — it is documented as test-only, but `shep settings init` also uses
it (paired with `initializeSettings()`) to replace the singleton outright.

**Trade-offs:**

- ✅ Simple, efficient access pattern
- ✅ Clear initialization point (bootstrap)
- ✅ Fail-fast if accessed before initialization
- ❌ Global state (harder to test in parallel)
- ✅ Test helper `resetSettings()` mitigates testing issue

### 3. Singleton Constraint (Database-Level)

**Decision:** Enforce single Settings record in database via SQLite constraint.

**Rationale:**

- Prevent accidental duplicate settings
- Match singleton semantics at persistence layer
- Database validates business rule (only one Settings allowed)

**Implementation:**

```sql
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  -- other columns...
);
```

**Trade-offs:**

- ✅ Data integrity enforced at DB level
- ✅ Impossible to create duplicate settings
- ✅ Clear error if constraint violated
- ❌ Slightly more complex queries (always WHERE id = 'singleton')

### 4. Repository Pattern with Prepared Statements

**Decision:** SQLite repository using prepared statements with named parameters.

**Rationale:**

- SQL injection prevention (security requirement)
- Clear separation between domain model and persistence
- Testable with in-memory databases
- Easy to swap SQLite for PostgreSQL/MySQL later

**Implementation:**

```typescript
// packages/core/src/infrastructure/repositories/sqlite-settings.repository.ts
@injectable()
export class SQLiteSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Database.Database) {}

  async initialize(settings: Settings): Promise<void> {
    const row = toDatabase(settings);
    const stmt = this.db.prepare(`
      INSERT INTO settings (
        id, created_at, updated_at,
        model_default, agent_type, agent_auth_method, ...
      ) VALUES (
        @id, @created_at, @updated_at,
        @model_default, @agent_type, @agent_auth_method, ...
      )
    `);
    stmt.run(row); // Named parameters prevent SQL injection
  }
}
```

**Trade-offs:**

- ✅ SQL injection impossible (prepared statements)
- ✅ Testable with in-memory DB
- ✅ Clean Architecture (domain → port → implementation)
- ❌ More boilerplate than ORMs
- ✅ Full control over SQL (performance optimization)

### 5. Database Mapping Layer

**Decision:** Separate mapper functions for TypeScript ↔ SQLite conversion.

**Rationale:**

- SQLite uses snake_case, TypeScript uses camelCase
- SQLite has limited types (no boolean, only integer 0/1)
- Nested objects must be flattened (models.default -> model_default)
- Separation of concerns (repository logic vs. mapping logic)

**Implementation:**

```typescript
// packages/core/src/infrastructure/persistence/sqlite/mappers/settings.mapper.ts

export interface SettingsRow {
  id: string;
  created_at: string; // ISO 8601 string (SQLite TEXT)
  updated_at: string;
  model_default: string; // Flattened from models.default
  sys_log_level: string;
  agent_type: string;
  // ... many more flattened columns
}

export function toDatabase(settings: Settings): SettingsRow {
  return {
    id: settings.id,
    created_at: settings.createdAt.toISOString(),
    model_default: settings.models.default,
    sys_log_level: settings.system.logLevel,
    agent_type: settings.agent.type,
    // ...
  };
}

export function fromDatabase(row: SettingsRow): Settings {
  return {
    id: row.id,
    createdAt: new Date(row.created_at),
    models: {
      default: row.model_default,
    },
    system: {
      logLevel: row.sys_log_level,
      // ...
    },
    agent: {
      type: row.agent_type as AgentType,
      // ...
    },
    // ...
  };
}
```

**Trade-offs:**

- ✅ Clear bidirectional conversion
- ✅ Easy to test mapping independently
- ✅ Repository stays focused on persistence logic
- ❌ Manual field mapping (no auto-mapping like ORMs)
- ✅ Explicit is better than implicit (catch bugs early)

### 6. Dependency Injection with tsyringe

**Decision:** Use tsyringe IoC container for dependency management.

**Rationale:**

- Clean Architecture requires dependency inversion
- Repository implementations resolved at runtime
- Use cases don't depend on concrete implementations
- Easy to mock dependencies in tests

**Implementation:**

```typescript
// packages/core/src/infrastructure/di/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

export async function initializeContainer(): Promise<typeof container> {
  const db = await getSQLiteConnection();
  await runSQLiteMigrations(db);

  // Register database instance
  container.registerInstance<Database.Database>('Database', db);

  // Register repository implementations
  container.register<ISettingsRepository>('ISettingsRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteSettingsRepository(database);
    },
  });

  // Register use cases as singletons
  container.registerSingleton(InitializeSettingsUseCase);
  container.registerSingleton(LoadSettingsUseCase);
  container.registerSingleton(UpdateSettingsUseCase);

  return container;
}

// src/presentation/cli/index.ts
import 'reflect-metadata'; // MUST be first import

async function bootstrap() {
  await initializeContainer();
  const useCase = container.resolve(InitializeSettingsUseCase);
  const settings = await useCase.execute();
  initializeSettings(settings);
}
```

**Trade-offs:**

- ✅ Loose coupling (depend on interfaces, not implementations)
- ✅ Testability (inject mocks easily)
- ✅ Single responsibility (container manages lifecycle)
- ❌ Requires `reflect-metadata` import (boilerplate)
- ❌ Decorator syntax (`@injectable()`) required

### 7. Async Bootstrap Pattern

**Decision:** CLI uses async bootstrap function before parsing commands.

**Rationale:**

- Database connection is async
- Migrations must run before repository usage
- Settings must be loaded before commands execute
- Fail-fast: If initialization fails, exit before CLI starts

**Implementation:**

```typescript
// src/presentation/cli/index.ts
async function bootstrap() {
  try {
    // Step 1: Initialize DI container (database + migrations)
    await initializeContainer();

    // Step 2: Initialize settings (load or create defaults)
    const initializeSettingsUseCase = container.resolve(InitializeSettingsUseCase);
    const settings = await initializeSettingsUseCase.execute();
    initializeSettings(settings);

    // Step 3: Set up Commander CLI and parse arguments
    const program = new Command().name('shep').version(version);
    await program.parseAsync();
  } catch (error) {
    messages.error('Failed to initialize CLI', error);
    process.exit(1);
  }
}

bootstrap();
```

**Trade-offs:**

- ✅ Clear initialization order
- ✅ Async operations handled correctly
- ✅ Fail-fast on errors (exit code 1)
- ✅ Global error handlers catch uncaught exceptions
- ❌ CLI startup slightly slower (database connection)
- ✅ Startup time is negligible (~50ms) for better reliability

## Data Flow

### Initialization Flow (First Run)

```
1. User runs: shep version
   ↓
2. bootstrap() → initializeContainer()
   ↓
3. getSQLiteConnection() → ~/.shep/data
   ↓
4. runSQLiteMigrations() → CREATE TABLE settings
   ↓
5. container.resolve(InitializeSettingsUseCase)
   ↓
6. useCase.execute()
   ├─ repository.load() → null (no settings exist)
   ├─ Create defaults: { models, user, environment, system }
   └─ repository.initialize(defaults)
       ↓
7. initializeSettings(defaults) → Singleton instance
   ↓
8. program.parseAsync() → Execute 'version' command
   ↓
9. Command can call getSettings() → Access singleton
```

### Subsequent Runs

```
1. User runs: shep <command>
   ↓
2. bootstrap() → initializeContainer()
   ↓
3. getSQLiteConnection() → ~/.shep/data (already exists)
   ↓
4. runSQLiteMigrations() → umzug: nothing pending
   ↓
5. container.resolve(InitializeSettingsUseCase)
   ↓
6. useCase.execute()
   ├─ repository.load() → Settings (existing record)
   └─ Return loaded settings (no database write)
       ↓
7. initializeSettings(settings) → Singleton instance
   ↓
8. program.parseAsync() → Execute command
   ↓
9. Command calls getSettings() → Access singleton
```

### Update Flow

```
1. User runs: shep settings model
   ↓
2. Command handler:
   ├─ settings = getSettings() (load from singleton)
   ├─ settings.models.default = <chosen model>
   └─ container.resolve(UpdateSettingsUseCase)
       ↓
3. useCase.execute(settings)
   ├─ repository.update(settings) → SQL UPDATE
   └─ Return updated settings
       ↓
4. updateSettings(updated) → singleton refreshed
   ↓
5. CLI continues with new settings for remaining commands
```

There is no `shep settings update` command. The per-section subcommands
(`model`, `agent`, `ide`, `workflow`, `adaptive-models`, `language`,
`messaging`, `worktree`) are the write path, and `shep settings` with no
subcommand launches the full wizard.

### Agent Configuration Flow

```
1. User runs: shep settings agent --agent cursor --auth session
   ↓
2. ConfigureAgentUseCase:
   ├─ AgentValidatorService.isAvailable('cursor')
   │    → reads AGENT_CATALOG[cursor] → binary 'cursor-agent'
   │    → runs `cursor-agent --version`
   ├─ Load current settings
   ├─ Update settings.agent.type = 'cursor'
   └─ repository.update(settings) → SQL UPDATE
       ↓
3. Singleton reset + reinitialize (agent.command.ts)
   ↓
4. Any subsequent command that needs an executor:
   ├─ Inject IAgentExecutorProvider from DI container
   └─ provider.getExecutor()
       → internally reads getSettings().agent.type → 'cursor'
       → delegates to AgentExecutorFactory.createExecutor('cursor', settings.agent)
       → CursorExecutorService
```

The binary, version args, supported flag and tool id all come from
`packages/core/src/domain/shared/agent-catalog.ts` — the single source of truth
for per-agent facts. `--auth <method>` is required whenever `--agent` is given
and is not `dev`.

> **ARCHITECTURAL RULE:** The `settings.agent.type` field is the single source of truth for which agent executor runs. All code paths that need an `IAgentExecutor` MUST go through `IAgentExecutorProvider.getExecutor()` — never call the factory directly or hardcode the agent type. See [AGENTS.md — Settings-Driven Agent Resolution](../../AGENTS.md#settings-driven-agent-resolution-mandatory).

## File Structure

```
packages/core/src/
├── domain/
│   └── generated/
│       └── output.ts              # TypeSpec-generated types (Settings interface)
│
├── application/
│   ├── ports/
│   │   └── output/
│   │       └── repositories/
│   │           └── settings.repository.interface.ts  # ISettingsRepository port
│   └── use-cases/
│       └── settings/
│           ├── initialize-settings.use-case.ts       # Load or create defaults
│           ├── load-settings.use-case.ts             # Load existing
│           ├── update-settings.use-case.ts           # Update existing
│           ├── check-onboarding-status.use-case.ts   # Has onboarding completed?
│           ├── complete-onboarding.use-case.ts       # Mark onboarding complete (TUI)
│           ├── complete-web-onboarding.use-case.ts   # Mark onboarding complete (web UI)
│           └── get-adaptive-model-plan.use-case.ts   # Resolved model tier triple
│
└── infrastructure/
    ├── di/
    │   └── container.ts           # tsyringe DI container setup
    ├── persistence/
    │   └── sqlite/
    │       ├── connection.ts      # Database connection (~/.shep/data)
    │       ├── migrations.ts      # umzug migration runner
    │       ├── legacy-migrations.ts  # V1–V36, registered programmatically
    │       ├── migrations/        # Migrations 36+, one .ts file each
    │       └── mappers/
    │           └── settings.mapper.ts  # TS ↔ SQL conversion
    ├── repositories/
    │   └── sqlite-settings.repository.ts  # SQLiteSettingsRepository impl
    └── services/
        └── settings.service.ts    # Singleton service (getSettings, initializeSettings)

src/presentation/
└── cli/
    └── index.ts               # CLI entry point (bootstrap function)
```

## Testing Strategy

### Unit Tests (Use Cases)

Mock the repository interface:

```typescript
// tests/unit/application/use-cases/settings/initialize-settings.test.ts
describe('InitializeSettingsUseCase', () => {
  it('should load existing settings', async () => {
    const mockRepo = {
      load: vi.fn().mockResolvedValue(existingSettings),
      initialize: vi.fn(),
    };
    const useCase = new InitializeSettingsUseCase(mockRepo);

    const result = await useCase.execute();

    expect(result).toBe(existingSettings);
    expect(mockRepo.initialize).not.toHaveBeenCalled();
  });
});
```

### Integration Tests (Repository)

Use in-memory SQLite:

```typescript
// tests/integration/infrastructure/repositories/sqlite-settings.repository.test.ts
import 'reflect-metadata'; // IMPORTANT: Required for tsyringe

describe('SQLiteSettingsRepository', () => {
  let db: Database.Database;
  let repository: SQLiteSettingsRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase(); // :memory:
    await runSQLiteMigrations(db);
    repository = new SQLiteSettingsRepository(db);
  });

  afterEach(() => db.close());

  it('should persist settings', async () => {
    await repository.initialize(settings);
    const loaded = await repository.load();
    expect(loaded).toMatchObject(settings);
  });
});
```

### E2E Tests (CLI)

Use temporary directory:

```typescript
// tests/e2e/cli/settings-initialization.test.ts
describe('CLI: settings initialization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shep-cli-test-'));
  });

  it('should create ~/.shep/ directory on first run', () => {
    const runner = createCliRunner({ env: { HOME: tempDir } });
    const result = runner.run('version');
    expect(result.success).toBe(true);
    expect(existsSync(join(tempDir, '.shep'))).toBe(true);
  });
});
```

## Performance Considerations

### Database Location

- **Location:** `~/.shep/data` (user home directory)
- **Connection:** Opened once at bootstrap, reused for all operations
- **Size:** Minimal (~16KB for empty database, ~20KB with settings)

### Singleton Access

- **Pattern:** Direct memory access (no function call overhead)
- **Latency:** ~1μs (microsecond) per getSettings() call
- **No serialization:** Returns direct object reference

### Migration Performance

- **First run:** ~20ms (create directory + database + table + insert)
- **Subsequent runs:** ~5ms (open connection + check user_version)
- **Impact:** Negligible for CLI usage

## Security Considerations

### SQL Injection Prevention

✅ **Prepared statements with named parameters** prevent SQL injection

### File Permissions

- **Directory:** `~/.shep/` created with `0700` (owner-only access)
- **Database:** Inherits directory permissions (not world-readable)

### Sensitive Data

- **User email:** Stored in plaintext (not sensitive in local DB)
- **Agent tokens:** `settings.agent.token` **is** part of the Settings model and
  is persisted in plaintext in the `agent_token` column. The same applies to the
  WhatsApp and messaging tokens (`whatsapp_cloud_api_access_token`,
  `messaging_telegram_bot_token`, and so on). They are protected by file
  permissions, not encryption.
- **File permissions are the boundary:** `~/.shep/` is created `0700`, so the
  database is unreadable by other users on the machine.
- Encrypting these fields at rest is listed under Future Enhancements below.

## Future Enhancements

### Planned Features

1. **Settings validation** - JSON Schema validation at runtime
2. **Settings migration** - Version settings schema for backwards compatibility
3. **Encrypted fields** - Support for encrypted sensitive values
4. **Settings export/import** - Backup and restore settings
5. **Multi-profile support** - Different settings per project/context

### Possible Migrations

**From SQLite to PostgreSQL:**

- Change repository implementation only
- Port interface stays the same
- Use cases unchanged
- Mapper layer handles SQL dialect differences

**From singleton to context-aware:**

- Add `context` parameter to getSettings(context)
- Support per-project settings overrides
- Global settings as fallback

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md#dependency-injection) - DI container documentation
- [CLAUDE.md](../../CLAUDE.md#data-storage) - Data storage locations
- [tdd-guide.md](../development/tdd-guide.md#testing-repositories-with-in-memory-sqlite) - Testing strategy
- [typespec-guide.md](../development/typespec-guide.md) - TypeSpec domain modeling
- [repository-pattern.md](./repository-pattern.md) - Repository pattern details
- [clean-architecture.md](./clean-architecture.md) - Architecture principles

---

## Maintaining This Document

**Update when:**

- Settings schema changes (TypeSpec model updated)
- New use cases added (load/update/delete)
- Repository implementation changes (e.g., PostgreSQL)
- Singleton pattern changes (e.g., context-aware)

**Related files:**

- `tsp/domain/entities/settings.tsp` - TypeSpec model definition
- `packages/core/src/infrastructure/di/container.ts` - DI container setup
- `packages/core/src/infrastructure/services/settings.service.ts` - Singleton service
- `packages/core/src/infrastructure/repositories/sqlite-settings.repository.ts` - Repository implementation
