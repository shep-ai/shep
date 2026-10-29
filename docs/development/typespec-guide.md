# TypeSpec Domain Modeling Guide

Complete guide to defining domain models using TypeSpec with code generation.

## Philosophy

> "Domain models are the single source of truth. TypeScript types are generated artifacts."

TypeSpec-First Architecture ensures:

- **Type Safety** - TypeScript types generated from canonical definitions
- **API Documentation** - OpenAPI specs generated automatically
- **Contract Validation** - JSON Schema for runtime validation
- **DRY Principle** - Define once, use everywhere

## TypeSpec Workflow

```
1. Define TypeSpec models          tsp/**/*.tsp
            │
            ▼
2. Generate                        pnpm generate
   (= tsp compile tsp/ --emit @typespec-tools/emitter-typescript,
      then prettier --write over the generated directory)
            │
            ▼
3. Import generated types          import type { Settings }
                                     from '@/domain/generated/output.js'
            │
            ▼
4. Build                           pnpm build
            │
            ▼
5. Test                            pnpm test
```

## Project Structure

Every directory has an `index.tsp` barrel that imports its own files;
`main.tsp` imports only the five top-level barrels. Adding a file means adding
one import line to the nearest `index.tsp` — never to `main.tsp`.

```
tsp/
├── main.tsp              # Entry point — imports the five barrels below
├── common/               # Shared types
│   ├── index.tsp
│   ├── base.tsp          # BaseEntity, SoftDeletableEntity, AuditableEntity
│   ├── scalars.tsp       # UUID scalar
│   ├── ask.tsp           # Askable interface pattern
│   └── enums/            # Shared enumerations
│       ├── index.tsp
│       ├── lifecycle.tsp      # SdlcLifecycle enum
│       ├── states.tsp         # status enums
│       ├── agent-config.tsp   # AgentType enum
│       └── ...
├── domain/               # Domain layer models
│   ├── index.tsp
│   ├── entities/         # One file per entity
│   │   ├── index.tsp
│   │   ├── feature.tsp
│   │   ├── epic.tsp
│   │   └── ...
│   └── value-objects/    # Embedded value objects
├── agents/               # Agent system models
│   ├── index.tsp
│   ├── agent-run.tsp
│   ├── feature-agent.tsp
│   └── ...
├── deployment/           # Deployment configuration
│   ├── index.tsp
│   ├── deploy-skill.tsp
│   └── ...
└── ui/                   # Presentation-layer value objects
```

## Generated Output

`tspconfig.yaml` wires three emitters — `@typespec/openapi3`,
`@typespec/json-schema` and `@typespec-tools/emitter-typescript` — and sets
`output-dir` to `apis/`, overriding the TypeScript emitter's output directory to
`packages/core/src/domain/generated`.

```
# After running: pnpm generate  (or pnpm tsp:compile)

apis/
├── openapi/
│   └── openapi.yaml      # OpenAPI 3.x spec (API documentation)
└── json-schema/          # JSON Schema files (one per model)
    ├── Feature.json
    ├── Task.json
    ├── Settings.json
    └── ...

packages/core/src/domain/generated/
└── output.ts             # TypeScript types (DO NOT EDIT)
```

Use **`pnpm generate`** rather than `pnpm tsp:compile` when you intend to commit
the result: `generate` runs the TypeScript emitter and then `prettier --write`
over the generated directory, which is exactly what CI re-runs when it checks
that the committed output is current. `tsp:compile` alone skips the formatting
pass and will leave the tree looking stale.

## Creating a New Domain Model

### Step 1: Define the TypeSpec Model

```typescript
// tsp/domain/entities/settings.tsp
import "../common/base.tsp";
import "../common/enums/log-level.tsp";

/**
 * Global application settings (singleton).
 * Stored at ~/.shep/data as single SQLite record.
 */
model Settings extends BaseEntity {
  /** Singleton ID (always 'singleton') */
  id: "singleton";

  /** Model configuration for different agents */
  models: ModelConfiguration;

  /** User profile information (optional) */
  user: UserProfile;

  /** Environment configuration */
  environment: EnvironmentConfig;

  /** System configuration */
  system: SystemConfig;
}

/**
 * AI model configuration for different agents.
 */
model ModelConfiguration {
  /** Model for analyze agent (e.g., 'claude-opus-4') */
  analyze: string;

  /** Model for requirements agent */
  requirements: string;

  /** Model for plan agent */
  plan: string;

  /** Model for implementation agent */
  implement: string;
}

/**
 * User profile information.
 */
model UserProfile {
  /** User's full name */
  name?: string;

  /** User's email address */
  email?: string;

  /** GitHub username */
  githubUsername?: string;
}

/**
 * Environment configuration.
 */
model EnvironmentConfig {
  /** Default text editor (vim, nano, code, etc.) */
  defaultEditor: string;

  /** Preferred shell (bash, zsh, fish, etc.) */
  shellPreference: string;
}

/**
 * System configuration.
 */
model SystemConfig {
  /** Enable automatic updates */
  autoUpdate: boolean;

  /** Logging level */
  logLevel: LogLevel;
}
```

### Step 2: Define Supporting Types

```typescript
// tsp/common/enums/log-level.tsp

/**
 * Logging level for system output.
 */
enum LogLevel {
  /** Debug level logging (most verbose) */
  debug,

  /** Informational messages */
  info,

  /** Warning messages */
  warn,

  /** Error messages only */
  error,
}
```

### Step 3: Extend Base Entity (if needed)

```typescript
// tsp/common/base.tsp

/**
 * Base entity with ID and timestamps.
 * All entities should extend this model.
 */
model BaseEntity {
  /** Unique identifier */
  id: string;

  /** Creation timestamp */
  @encode(DateTimeKnownEncoding.rfc3339)
  createdAt: utcDateTime;

  /** Last update timestamp */
  @encode(DateTimeKnownEncoding.rfc3339)
  updatedAt: utcDateTime;
}

/**
 * Entity with soft delete support.
 */
model SoftDeletableEntity extends BaseEntity {
  /** Soft delete flag */
  isDeleted: boolean = false;

  /** Deletion timestamp (null if not deleted) */
  @encode(DateTimeKnownEncoding.rfc3339)
  deletedAt?: utcDateTime;
}
```

### Step 4: Register the file in its barrel

`main.tsp` imports only the five top-level barrels, so a new file is registered
in the `index.tsp` of the directory it lives in — not in `main.tsp`.

```typescript
// tsp/domain/entities/index.tsp
import "./feature.tsp";
import "./epic.tsp";
import "./settings.tsp"; // NEW
```

```typescript
// tsp/main.tsp — unchanged when you add an entity
import "./common/index.tsp";
import "./domain/index.tsp";
import "./agents/index.tsp";
import "./deployment/index.tsp";
import "./ui/index.tsp";

@service(#{ title: "Shep AI Domain Models" })
namespace ShepAI.Domain;
```

### Step 5: Compile and Generate Types

```bash
# Generate TypeScript + OpenAPI + JSON Schema, then format the output
pnpm generate

# Verify generated output
grep "export interface Settings" packages/core/src/domain/generated/output.ts
```

### Step 6: Use Generated Types in Code

```typescript
// packages/core/src/application/use-cases/settings/initialize-settings.use-case.ts
import type { Settings } from '@/domain/generated/output.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

export class InitializeSettingsUseCase {
  constructor(private readonly settingsRepository: ISettingsRepository) {}

  async execute(): Promise<Settings> {
    // Check if settings already exist
    const existing = await this.settingsRepository.load();
    if (existing !== null) {
      return existing;
    }

    // Create default settings (using generated type)
    const defaults: Settings = {
      id: 'singleton',
      createdAt: new Date(),
      updatedAt: new Date(),
      models: {
        analyze: 'claude-opus-4',
        requirements: 'claude-sonnet-4',
        plan: 'claude-sonnet-4',
        implement: 'claude-sonnet-4',
      },
      user: {},
      environment: {
        defaultEditor: 'vim',
        shellPreference: 'bash',
      },
      system: {
        autoUpdate: true,
        logLevel: 'info',
      },
    };

    // Initialize in repository
    await this.settingsRepository.initialize(defaults);

    return defaults;
  }
}
```

## TypeSpec Best Practices

### 1. One Model Per File (SRP)

```
✅ Good: tsp/domain/entities/feature.tsp (one model)
✅ Good: tsp/domain/entities/task.tsp (one model)
❌ Bad:  tsp/domain/entities.tsp (all models in one file)
```

### 2. Use JSDoc Comments

```typescript
/**
 * Feature entity tracking work through SDLC lifecycle.
 * Represents a unit of work from requirements to deployment.
 */
model Feature extends BaseEntity {
  /** Human-readable feature name */
  name: string;

  /** Detailed feature description */
  description: string;

  /** Current SDLC lifecycle phase */
  lifecycle: SdlcLifecycle;

  /** Repository path this feature belongs to */
  repoPath: string;
}
```

### 3. Use Enums for Fixed Sets

```typescript
// Good: Enum for fixed set of values
enum SdlcLifecycle {
  Requirements,
  Plan,
  Implementation,
  Test,
  Deploy,
  Maintenance,
}

// Bad: String with no validation
model Feature {
  lifecycle: string; // Could be anything!
}
```

### 4. Use Optional Fields Appropriately

```typescript
model UserProfile {
  // Optional fields with ?
  name?: string;
  email?: string;

  // Required field (no ?)
  createdAt: utcDateTime;
}
```

### 5. Extend Base Entities

```typescript
// Good: Extend BaseEntity for consistency
model Settings extends BaseEntity {
  // Inherits: id, createdAt, updatedAt
  models: ModelConfiguration;
}

// Bad: Duplicate fields
model Settings {
  id: string;
  createdAt: utcDateTime; // Duplicate!
  updatedAt: utcDateTime; // Duplicate!
  models: ModelConfiguration;
}
```

## TypeSpec Annotations

### @encode - Date/Time Formatting

```typescript
model BaseEntity {
  /** Creation timestamp (RFC 3339 format) */
  @encode(DateTimeKnownEncoding.rfc3339)
  createdAt: utcDateTime;
}

// Generated TypeScript:
// createdAt: string; (ISO 8601 string)
```

### @deprecated - Mark Obsolete Fields

```typescript
model LegacyFeature {
  name: string;

  /** @deprecated Use 'description' instead */
  @deprecated("Use 'description' instead")
  summary: string;

  description: string;
}
```

### @example - Provide Examples

```typescript
model Settings {
  /** Default text editor
   * @example "vim"
   * @example "code"
   */
  defaultEditor: string;
}
```

## Modifying Existing Models

### Adding a Field

```typescript
// tsp/domain/entities/settings.tsp

model Settings extends BaseEntity {
  // ... existing fields ...

  /** NEW: Telemetry opt-out flag */
  telemetryEnabled: boolean = true; // Default value
}
```

**Workflow:**

1. Modify `.tsp` file
2. Run `pnpm tsp:compile` → Regenerate TypeScript
3. Update database migration (add column)
4. Update repository mapper (add field mapping)
5. Run tests → Fix compile errors
6. Commit both `.tsp` and generated files

### Removing a Field (Breaking Change)

```typescript
// tsp/domain/entities/settings.tsp

model Settings extends BaseEntity {
  // ... existing fields ...

  // REMOVED: oldField: string; ← Delete this line
}
```

**Workflow:**

1. Remove field from `.tsp` file
2. Run `pnpm tsp:compile` → TypeScript compile errors appear
3. Fix all references to removed field
4. Update database migration (remove column or mark deprecated)
5. Run tests → Ensure no broken references
6. Commit changes

### Renaming a Field

```typescript
// Before
model Settings {
  editorPreference: string;
}

// After
model Settings {
  defaultEditor: string;
}
```

**Workflow:**

1. Add new field with new name
2. Mark old field as `@deprecated`
3. Run `pnpm tsp:compile`
4. Migrate code to use new field
5. Create database migration (rename column or dual-write)
6. After migration period, remove deprecated field
7. Run `pnpm tsp:compile` again

## TypeSpec Commands

| Script         | Command                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `generate`     | `pnpm tsp:codegen` — the one you want before committing                                                     |
| `tsp:codegen`  | `tsp compile tsp/ --emit @typespec-tools/emitter-typescript && prettier --write packages/core/src/domain/generated/` |
| `tsp:compile`  | `tsp compile tsp/` — runs every emitter in `tspconfig.yaml`, no formatting pass                              |
| `lint:tsp`     | `tsp compile tsp/ --no-emit` — validate only, emit nothing                                                  |
| `tsp:format`   | `tsp format "tsp/**/*.tsp"` (`format:tsp` is the same command)                                              |
| `tsp:watch`    | `tsp compile tsp/ --watch`                                                                                  |
| `validate`     | `lint:fix` → `format` → `typecheck` → `tsp:compile`                                                         |

```bash
# Regenerate + format (what CI verifies)
pnpm generate

# Validate without emitting anything
pnpm lint:tsp

# Watch mode (recompile on changes)
pnpm tsp:watch

# Format TypeSpec sources
pnpm tsp:format

# Full local check before pushing
pnpm validate
```

## Troubleshooting

### Error: "Duplicate identifier"

**Cause:** Model name conflicts with existing type.

**Solution:** Rename the model or use namespace:

```typescript
namespace Settings {
  model Configuration {
    // ...
  }
}
```

### Error: "Cannot find '@typespec/…'"

**Cause:** Missing or out-of-date TypeSpec dependencies.

**Solution:** reinstall first — the toolchain is already declared in
`devDependencies` (`@typespec/compiler`, `@typespec/json-schema`,
`@typespec/openapi3`, `@typespec/protobuf`,
`@typespec/prettier-plugin-typespec` and `@typespec-tools/emitter-typescript`).

```bash
pnpm install
```

Only add a package if you are genuinely introducing a new library (for example
`@typespec/http`, which this project does not currently use).

### Generated TypeScript Types Don't Update

**Cause:** Cached compilation output.

**Solution:**

```bash
# Clear generated output
rm -rf apis/ packages/core/src/domain/generated/

# Recompile
pnpm tsp:compile
```

### TypeScript Compile Errors After TypeSpec Change

**Cause:** Breaking change in domain model (expected behavior).

**Solution:**

1. Let TypeScript show all compile errors
2. Fix each reference to match new type
3. Update tests to match new structure
4. This is **intentional** - type safety catches issues early!

## Integration with CI/CD

TypeSpec compilation runs in CI pipeline:

The **Lint & Format** job runs `pnpm tsp:compile` to prove the TypeSpec still
compiles. The **Type Check** job is the one that catches stale generated output:

```yaml
# .github/workflows/ci.yml — typecheck job
- run: pnpm run generate
- name: Verify generated code is committed
  run: |
    if ! git diff --exit-code -- packages/core/src/domain/generated apis; then
      echo "::error::Generated output is stale. Run 'pnpm run generate' and commit the result."
      exit 1
    fi
- run: pnpm run typecheck
```

The `pre-commit` hook runs `pnpm generate` and stages
`apis/json-schema/` and `packages/core/src/domain/generated/` for you, so in
practice this only fires when the hook was bypassed.

**IMPORTANT:** Always commit generated files (`packages/core/src/domain/generated/output.ts`) to version control. This ensures:

- CI can detect if someone manually edited generated files
- Code reviews show generated type changes
- Deployments don't require TypeSpec toolchain

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md#typespec-domain-models) - TypeSpec architecture overview
- [tdd-guide.md](./tdd-guide.md#testing-typespec-generated-code) - Testing TypeSpec-generated code
- [TypeSpec Official Docs](https://typespec.io/) - Language reference

---

## Maintaining This Document

**Update when:**

- New TypeSpec features are adopted
- Generated output structure changes
- New emitters are added (e.g., JSON Schema, Protobuf)

**Related files:**

- `tsp/` - TypeSpec source files
- `tspconfig.yaml` - TypeSpec configuration
- `package.json` - TypeSpec dependencies and scripts
