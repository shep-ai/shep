# Shep AI Domain Models (TypeSpec)

TypeSpec definitions for the Shep AI CLI domain models. TypeSpec is a language for defining data models and API contracts that compiles to OpenAPI, JSON Schema, and more.

## Quick Start

```bash
# From project root
pnpm install
pnpm tsp:compile    # Compile to OpenAPI
pnpm tsp:format     # Format TypeSpec files
pnpm tsp:watch      # Watch mode
```

## Directory Structure

```
tsp/
├── main.tsp                         # Entry point (imports all index files)
├── README.md                        # This file
├── common/
│   ├── index.tsp                    # Re-exports all common modules
│   ├── scalars.tsp                  # UUID scalar type
│   ├── base.tsp                     # BaseEntity, SoftDeletableEntity, AuditableEntity
│   ├── ask.tsp                      # AskRequest, AskResponse, Askable interface
│   └── enums/
│       ├── index.tsp                # Re-exports all enums
│       ├── lifecycle.tsp            # SdlcLifecycle
│       ├── states.tsp               # PlanState, TaskState, ArtifactState, etc.
│       ├── artifact.tsp             # ArtifactCategory, ArtifactFormat
│       ├── message.tsp              # MessageRole
│       ├── deployment.tsp           # DeploymentState, DeployMethod, PortProtocol
│       ├── requirement.tsp          # RequirementType
│       └── agent.tsp                # AgentStatus
├── domain/
│   ├── index.tsp                    # Re-exports entities + value-objects
│   ├── entities/
│   │   ├── index.tsp                # Re-exports all entities
│   │   ├── feature.tsp              # Feature (aggregate root)
│   │   ├── plan.tsp                 # Plan
│   │   ├── task.tsp                 # Task
│   │   ├── action-item.tsp          # ActionItem
│   │   ├── acceptance-criteria.tsp  # AcceptanceCriteria
│   │   ├── artifact.tsp             # Artifact
│   │   ├── message.tsp              # Message
│   │   ├── requirement.tsp          # Requirement
│   │   ├── research.tsp             # Research
│   │   └── timeline-event.tsp       # TimelineEvent
│   └── value-objects/
│       ├── index.tsp                # Re-exports value objects
│       └── gantt.tsp                # GanttViewData, GanttTask
├── agents/
│   ├── index.tsp                    # Re-exports all agent modules
│   ├── base.tsp                     # AgentInstance
│   ├── feature-agent.tsp            # FeatureAgent + operations
│   ├── deploy-agent.tsp             # LocalDeployAgent + operations
│   └── deploy-target.tsp            # DeployTarget union types
└── deployment/
    ├── index.tsp                    # Re-exports all deployment modules
    ├── port-map.tsp                 # PortMap
    ├── deployment.tsp               # Deployment
    └── deploy-skill.tsp             # DeploySkill
```

## Model Categories

### Common Types (`common/`)

| File          | Contents                                               |
| ------------- | ------------------------------------------------------ |
| `scalars.tsp` | `UUID` scalar type                                     |
| `base.tsp`    | `BaseEntity`, `SoftDeletableEntity`, `AuditableEntity` |
| `ask.tsp`     | `AskRequest`, `AskResponse`, `Askable` interface       |
| `enums/`      | All enumeration types                                  |

### Domain Entities (`domain/entities/`)

One model per file, all extending `BaseEntity`:

| Entity          | Description                                       |
| --------------- | ------------------------------------------------- |
| `Feature`       | Aggregate root - work item through SDLC lifecycle |
| `Plan`          | Implementation plan with tasks and artifacts      |
| `Task`          | Work item within a plan                           |
| `ActionItem`    | Granular step within a task                       |
| `Artifact`      | Generated document (PRD, RFC, Design, TechPlan)   |
| `Requirement`   | User or inferred requirement                      |
| `Research`      | Research topic exploration                        |
| `Message`       | Conversation message                              |
| `TimelineEvent` | Feature timeline event                            |

### Agent System (`agents/`)

| Model              | Description                       |
| ------------------ | --------------------------------- |
| `AgentInstance`    | Running agent instance            |
| `FeatureAgent`     | Main orchestrating SDLC agent     |
| `LocalDeployAgent` | Local deployment agent            |
| `DeployTarget`     | Union type for deployment targets |

### Deployment (`deployment/`)

| Model         | Description                    |
| ------------- | ------------------------------ |
| `Deployment`  | Running deployment instance    |
| `DeploySkill` | Deployment configuration/skill |
| `PortMap`     | Port mapping configuration     |

## Base Entity Templates

All entities extend one of these base templates:

```typespec
model BaseEntity {
  id: UUID;
  createdAt: utcDateTime; // @visibility(Lifecycle.Read)
  updatedAt: utcDateTime; // @visibility(Lifecycle.Read)
}

model SoftDeletableEntity extends BaseEntity {
  deletedAt?: utcDateTime;
}

model AuditableEntity extends BaseEntity {
  createdBy?: UUID;
  updatedBy?: UUID;
}
```

## Output

Compiled artifacts are output to `apis/` (at project root):

```
apis/
├── openapi/       # OpenAPI 3.x specs
└── json-schema/   # JSON Schema definitions (one per model)
```

Configuration is in `tspconfig.yaml` at the project root.

### Available Emitters

| Emitter                 | Output              | Status                         |
| ----------------------- | ------------------- | ------------------------------ |
| `@typespec/openapi3`    | `apis/openapi/`     | ✅ Enabled                     |
| `@typespec/json-schema` | `apis/json-schema/` | ✅ Enabled                     |
| `@typespec/protobuf`    | `apis/protobuf/`    | ⏸️ Ready (uncomment in config) |

## Contributing

When adding new models:

1. Create a new `.tsp` file in the appropriate directory
2. Extend the appropriate base entity
3. Add `@doc` decorators to model and all properties
4. Export from the directory's `index.tsp`
5. Run `pnpm tsp:compile` to verify

---

## Maintaining This Document

**Update when:**

- New models are added
- Directory structure changes
- Base entity templates evolve

**Keep concise**: Focus on structure and quick reference.
