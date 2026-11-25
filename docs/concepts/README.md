# Concepts Documentation

Core domain concepts and business logic for Shep AI CLI.

## Contents

| Document                                 | Description                              |
| ---------------------------------------- | ---------------------------------------- |
| [sdlc-lifecycle.md](./sdlc-lifecycle.md) | Feature lifecycle states and transitions |
| [feature-model.md](./feature-model.md)   | Feature entity and relationships         |
| [task-model.md](./task-model.md)         | Tasks and Action Items                   |
| [artifacts.md](./artifacts.md)           | Generated documentation artifacts        |
| [repo-analysis.md](./repo-analysis.md)   | Repository analysis system               |
| [skills.md](./skills.md)           | Agent skills injection model             |

## Domain Overview

```
+-------------------------------------------------------------+
|                         Feature                              |
|  +-----------------------------------------------------+    |
|  | lifecycle: SdlcLifecycle                             |    |
|  | plan?.requirements: Requirement[]                    |    |
|  | plan?.tasks: Task[]                                  |    |
|  | relatedArtifacts: Artifact[]                         |    |
|  +-----------------------------------------------------+    |
|                           |                                  |
|         +-----------------+-----------------+               |
|         v                 v                 v               |
|  +-------------+   +-------------+   +-------------+       |
|  | Requirement |   |    Task     |   |  Artifact   |       |
|  +-------------+   +------+------+   +-------------+       |
|                           |                                  |
|                           v                                  |
|                    +-------------+                           |
|                    | ActionItem  |                           |
|                    +-------------+                           |
+-------------------------------------------------------------+
```

## Key Principles

1. **Feature-Centric**: Everything revolves around Features
2. **Lifecycle-Driven**: Work progresses through defined phases
3. **Dependency-Aware**: Tasks and ActionItems have explicit dependencies
4. **Document-First**: Artifacts capture decisions before implementation

## Reading Order

For new contributors:

1. [sdlc-lifecycle.md](./sdlc-lifecycle.md) - Understand the phases
2. [feature-model.md](./feature-model.md) - Learn the central entity
3. [task-model.md](./task-model.md) - Understand work breakdown
4. [artifacts.md](./artifacts.md) - Learn about generated docs
5. [repo-analysis.md](./repo-analysis.md) - Understand context gathering

---

## Maintaining This Directory

**Update when:**

- New domain concepts are introduced
- Existing concepts change significantly
- Relationships between concepts evolve

**File naming:**

- Use kebab-case
- Name after the concept (e.g., `feature-model.md`)
- Keep names singular
