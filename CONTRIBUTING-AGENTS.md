# Contributing Guidelines for AI Agents

Rules and guidelines for AI agents (Cursor, Claude Code, Copilot, etc.) when contributing to this repository. Project skills live in `.cursor/skills/`.

## Quick Reference

| Rule         | Requirement                                         |
| ------------ | --------------------------------------------------- |
| **Specs**    | **Start ALL features with `/shep-kit:new-feature`** |
| Commits      | Conventional Commits format, always                 |
| Scope        | Required for all commits                            |
| Co-author    | Include `Co-Authored-By` footer                     |
| TDD          | Write tests first (Red-Green-Refactor)              |
| Architecture | Follow Clean Architecture layers                    |
| Edits        | Read files before editing                           |

## Spec-Driven Development (MANDATORY)

**All feature work MUST begin with `/shep-kit:new-feature`.** No exceptions.

See [Spec-Driven Workflow](./docs/development/spec-driven-workflow.md) for complete details.

### Workflow

```
/shep-kit:new-feature → /shep-kit:research → /shep-kit:plan → implement
```

### Quick Commands

| Command                 | Purpose             | Output                            |
| ----------------------- | ------------------- | --------------------------------- |
| `/shep-kit:new-feature` | Start new feature   | Branch + `specs/NNN-name/spec.md` |
| `/shep-kit:research`    | Technical analysis  | `research.md`                     |
| `/shep-kit:plan`        | Implementation plan | `plan.md` + `tasks.md`            |

### What the Agent Does

1. **Gathers minimal input** (feature name + one-liner)
2. **Creates branch** `feat/NNN-feature-name` from main
3. **Scaffolds spec directory** with templates
4. **Analyzes codebase** to infer affected areas, dependencies, size
5. **Proposes spec** for human review
6. **Commits** after approval

### Spec Directory Structure

```
specs/NNN-feature-name/
├── spec.md         # Requirements (filled by /new-feature)
├── research.md     # Technical decisions (filled by /research)
├── plan.md         # Architecture (filled by /plan)
├── tasks.md        # Task breakdown (filled by /plan)
├── data-model.md   # Entity changes (if needed)
└── contracts/      # API specs (if needed)
```

## Commit Rules

**ALWAYS use Conventional Commits. No exceptions.**

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types (Required)

| Type       | Description                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or functionality               |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation changes only                 |
| `style`    | Formatting, whitespace, no code change     |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or updating tests                   |
| `chore`    | Maintenance, dependencies, build config    |
| `perf`     | Performance improvements                   |
| `ci`       | CI/CD configuration changes                |

### Scope (Required)

Use the component or area being modified:

| Scope         | Area                            |
| ------------- | ------------------------------- |
| `specs`       | Feature specifications          |
| `cli`         | CLI commands and presentation   |
| `tui`         | Terminal UI components          |
| `web`         | Web UI (Next.js)                |
| `agents`      | LangGraph agent implementations |
| `domain`      | Domain entities and services    |
| `application` | Use cases and ports             |
| `infra`       | Infrastructure layer            |
| `db`          | Database/persistence            |
| `config`      | Configuration handling          |
| `tests`       | Test infrastructure             |
| `deps`        | Dependencies                    |
| `build`       | Build configuration             |

### Examples

```bash
# Features
feat(cli): add interactive wizard for new features
feat(agents): implement repository analysis caching
feat(web): add dark mode toggle

# Fixes
fix(cli): resolve config path on Windows
fix(db): handle concurrent write conflicts
fix(tui): correct keyboard navigation in menus

# Documentation
docs(readme): update installation instructions
docs(architecture): add agent system diagrams

# Refactoring
refactor(domain): extract validation logic to value objects
refactor(infra): simplify repository implementations

# Tests
test(domain): add Feature entity edge cases
test(e2e): cover onboarding flow

# Chores
chore(deps): update vitest to v1.0
chore(build): optimize bundle size
```

### Commit Rules

1. **Type is mandatory** - Every commit must start with a valid type
2. **Scope is mandatory** - Always specify the affected component
3. **Description must be imperative** - Use "add" not "added" or "adds"
4. **Description must be ALL lowercase** - No capital letters after the colon, including acronyms (`pr` not `PR`, `api` not `API`, `ui` not `UI`)
5. **No period at the end** - Description should not end with a period
6. **Keep it concise** - Description should be under 72 characters
7. **Body for details** - Use the body for explaining "why" if needed

### Breaking Changes

For breaking changes, add `!` after the scope and explain in the footer:

```
feat(api)!: change response format for tasks endpoint

BREAKING CHANGE: Task responses now include nested actionItems array
instead of flat structure. Update clients accordingly.
```

## Co-Author Attribution

Always include the Shep Bot co-author footer when committing:

```
feat(cli): add status command

Co-Authored-By: Shep Bot <shep-agent@users.noreply.github.com>
```

Do NOT use any other Co-Authored-By trailer (e.g. Claude, Anthropic). All commits must be attributed to Shep Bot.

## Code Guidelines

### Before Editing

1. **Always read files first** - Never edit a file you haven't read
2. **Understand context** - Read related files to understand patterns
3. **Check existing tests** - Understand expected behavior

### Architecture Rules

Follow Clean Architecture - dependencies point inward:

```
Presentation → Application → Domain ← Infrastructure
```

| Layer          | Can Import          | Cannot Import                     |
| -------------- | ------------------- | --------------------------------- |
| Domain         | Nothing             | Any other layer                   |
| Application    | Domain              | Infrastructure, Presentation      |
| Infrastructure | Application, Domain | Presentation                      |
| Presentation   | Application         | Domain (directly), Infrastructure |

### File Locations

| What            | Where                                        |
| --------------- | -------------------------------------------- |
| Domain entities | `src/domain/entities/`                       |
| Value objects   | `src/domain/value-objects/`                  |
| Use cases       | `src/application/use-cases/`                 |
| Port interfaces | `src/application/ports/`                     |
| Repositories    | `src/infrastructure/repositories/`           |
| Agent nodes     | `src/infrastructure/agents/langgraph/nodes/` |
| CLI commands    | `src/presentation/cli/commands/`             |
| Web components  | `src/presentation/web/components/`           |

### Testing (TDD Required)

Follow Red-Green-Refactor:

1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to pass
3. **REFACTOR** - Improve while keeping tests green

```bash
pnpm test:watch    # TDD mode
pnpm test          # Run all tests
pnpm test:single <path>  # Single file
```

## Documentation Rules

### Cross-Reference Validation

Before modifying documentation, validate consistency across:

- `README.md` - User-facing overview
- `CLAUDE.md` - AI agent reference
- `AGENTS.md` - Agent system details
- `docs/` - Detailed documentation

### Updating Documentation

When changing code that affects documentation:

1. Update `CLAUDE.md` if architecture/patterns change
2. Update `docs/api/` if interfaces change
3. Update `docs/concepts/` if domain models change
4. Run `/cross-validate-artifacts` to check consistency

## Pull Request Guidelines

### Title Format

Use conventional commit format:

```
feat(scope): description of change
```

### Description Template

```markdown
## Summary

Brief description of changes

## Changes

- Change 1
- Change 2

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] E2E tests pass (if applicable)

## Documentation

- [ ] CLAUDE.md updated (if needed)
- [ ] Related docs updated
```

## Prohibited Actions

1. **Never commit secrets** - No API keys, tokens, passwords
2. **Never skip tests** - All tests must pass before commit
3. **Never force push to main** - Unless explicitly authorized
4. **Never modify without reading** - Always read files first
5. **Never ignore lint errors** - Fix all linting issues

## Useful Commands

```bash
# Development
pnpm dev              # Start dev mode
pnpm build            # Build project
pnpm typecheck        # Type checking

# Testing
pnpm test             # Run all tests
pnpm test:watch       # TDD mode
pnpm test:e2e         # E2E tests

# Quality
pnpm lint             # Check linting
pnpm lint:fix         # Fix lint issues
pnpm format           # Format code
```

---

## Maintaining This Document

**Update when:**

- Commit conventions change
- New scopes are added
- Architecture patterns evolve
- New prohibited actions identified

**Related docs:**

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Human contributor guidelines
- [CLAUDE.md](./CLAUDE.md) - AI agent codebase reference
- [docs/development/](./docs/development/) - Development guides
