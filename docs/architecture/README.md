# Architecture Documentation

This directory contains documentation about Shep AI CLI's system architecture and design patterns.

## Contents

| Document                                         | Description                                               |
| ------------------------------------------------ | --------------------------------------------------------- |
| [overview.md](./overview.md)                     | High-level system architecture and component interactions |
| [clean-architecture.md](./clean-architecture.md) | Clean Architecture implementation details                 |
| [repository-pattern.md](./repository-pattern.md) | Data persistence and repository pattern                   |
| [agent-system.md](./agent-system.md)             | LangGraph-based agent system design and implementation    |
| [settings-service.md](./settings-service.md)     | Global settings service architecture                      |
| [spaces.md](./spaces.md)                         | Spaces, product lines and memory isolation                |
| [tracker-sync.md](./tracker-sync.md)             | Linear and Jira connections and two-way sync              |
| [knowledge.md](./knowledge.md)                   | Notion knowledge sources and what agents read             |
| [opportunities.md](./opportunities.md)           | Signals, opportunities, scoring and the capacity line     |
| [feedback.md](./feedback.md)                     | Keyed feedback intake and lexical themes                  |
| [discovery.md](./discovery.md)                   | The agent that proposes evidence-backed opportunities     |
| [bug-loop.md](./bug-loop.md)                     | Investigations, ranked hypotheses and test-first fixes    |
| [pr-comment-loop.md](./pr-comment-loop.md)       | Review comments read, addressed and answered              |

## Quick Reference

### Architecture Layers

```
Presentation -> Application -> Domain <- Infrastructure
     |              |          ^           ^
   CLI/Web      Use Cases   Entities   Repositories
```

### Key Principles

1. **Dependency Inversion** - High-level modules don't depend on low-level modules
2. **Single Responsibility** - Each component has one reason to change
3. **Interface Segregation** - Many specific interfaces over one general-purpose
4. **Open/Closed** - Open for extension, closed for modification

## Getting Started

New contributors should read:

1. [overview.md](./overview.md) - Understand the big picture
2. [clean-architecture.md](./clean-architecture.md) - Learn the layer structure
3. Specific pattern docs as needed

---

## Maintaining This Directory

**Update when:**

- New architectural patterns are introduced
- Major refactoring occurs
- New subsystems are added

**File naming:**

- Use kebab-case
- Be descriptive but concise
- Suffix with `.md`

**Cross-references:**

- Link to related docs in other directories
- Keep links relative
- Verify links after moves/renames
