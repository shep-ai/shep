# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

`@shepai/cli` — Autonomous AI-native SDLC platform — run parallel AI agents in isolated worktrees to automate the development cycle from idea to deploy.

## Spec Workflow

**All feature work MUST begin with `/shep-kit:new-feature`.** See [spec-driven-workflow](./docs/development/spec-driven-workflow.md).

`/shep-kit:new-feature → /shep-kit:research → /shep-kit:plan → /shep-kit:implement → /shep-kit:commit-pr`

Specs live in `specs/NNN-feature-name/`. **Edit YAML only — Markdown is auto-generated.**

## Commands

| Command              | Purpose                         |
| -------------------- | ------------------------------- |
| `pnpm build`         | Build CLI only (fast, for dev)  |
| `pnpm build:release` | Build CLI + web (CI/packaging)  |
| `pnpm test`          | Run all tests (unit + integration + e2e) |
| `pnpm test:unit`     | Unit tests only                 |
| `pnpm test:int`      | Integration tests only          |
| `pnpm test:e2e`      | Playwright e2e tests            |
| `pnpm lint:fix`      | Fix lint issues                 |
| `pnpm validate`      | Lint + format + typecheck + tsp |
| `pnpm dev:cli`       | Run CLI locally (tsx)           |
| `pnpm dev:web`       | Start Next.js dev server        |

## Architecture

Clean Architecture — four layers in `packages/core/src/` (dependencies point inward):

- `domain/` — Core business logic, no external deps
- `application/` — Use cases, output port interfaces
- `infrastructure/` — External concerns: DB, agents, services
- `presentation/` — CLI, TUI, Web UI (`src/presentation/`)

See [clean-architecture](./docs/architecture/clean-architecture.md).

## Mandatory Rules

- **MANDATORY — TDD**: Write failing tests FIRST (RED → GREEN → REFACTOR). Every plan phase must define explicit TDD cycles. See [tdd-guide](./docs/development/tdd-guide.md).
- **MANDATORY — TypeSpec-first**: Domain models defined in `tsp/`. Run `pnpm tsp:compile` to generate `packages/core/src/domain/generated/output.ts`. Never edit generated files. See [typespec-guide](./docs/development/typespec-guide.md).
- **MANDATORY — Agent resolution**: No component may hardcode an agent type. All resolution flows through `IAgentExecutorProvider`. See [AGENTS.md](./AGENTS.md).
- **MANDATORY — Storybook stories**: Every web UI component MUST have a colocated `.stories.tsx` file. Commits without stories will be rejected.
- **MANDATORY — Spec-driven**: All features start with `/shep-kit:new-feature`. No implementation without a spec.
- **MANDATORY — Own every failure**: You are the ONLY developer. Every test failure, CI failure, and security scan failure is YOUR responsibility. NEVER use the words "unrelated", "pre-existing", or "not our changes". See [integrity rules](./.claude/rules/integrity.md).
- **MANDATORY — Read LESSONS.md**: You MUST read `LESSONS.md` at the start of every session before writing any code. It contains hard-won lessons from past mistakes. Ignoring it means repeating failures that have already been solved.

## Commit Format

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

| Types | feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert |
| Scopes | specs, shep-kit, cli, tui, web, api, domain, agents, deployment, tsp, deps, config, dx, release, ci |

The scope is **optional** — commitlint reports an unknown scope as a warning (severity 1) and
`.github/workflows/pr-check.yml` sets `requireScope: false`. Subject **case is not enforced**
(`'subject-case': [0]`); keep it under 72 characters with no trailing period. `docs` and `build`
are *types*, never scopes. Release impact (`release.config.mjs`): `feat` → minor;
`fix`, `perf`, `revert` and **`refactor`** → patch; `docs`, `style`, `test`, `build`, `ci`,
`chore` → no release.

## TypeSpec Domain Models

Domain types are **authored in TypeSpec**, never hand-written in TypeScript.

- Source: `tsp/` (`tsp/common/enums/`, `tsp/domain/entities/`, `tsp/agents/`, …)
- Generated: `packages/core/src/domain/generated/output.ts` (+ `index.ts`) — **never edit these**
- Regenerate: `pnpm generate` (= `tsp compile tsp/ --emit @typespec-tools/emitter-typescript`
  followed by `prettier --write` over the generated directory)
- Compile-check only: `pnpm tsp:compile`; format: `pnpm tsp:format`; watch: `pnpm tsp:watch`

The generated file is **committed**. CI's Type Check job re-runs `pnpm generate` and fails if the
result differs from what is committed, and the `pre-commit` hook runs `pnpm generate` and stages
`packages/core/src/domain/generated/` for you.

Any domain concept used for branching — status, phase, mode, agent type — MUST be a TypeSpec enum
rather than a raw string. Adding a member to a total-`Record` consumer (such as
`AGENT_CATALOG` in `domain/shared/agent-catalog.ts`) turns the omission into a compile error,
which is the intended way to discover everything a new member must touch.

Full guide: [docs/development/typespec-guide.md](./docs/development/typespec-guide.md).

## Dependency Injection

Shep uses **tsyringe**. `reflect-metadata` must be imported before anything else — it is the
first import in `src/presentation/cli/index.ts`.

- Container: `packages/core/src/infrastructure/di/container.ts`, exposing
  `initializeContainer()` (opens the database, runs migrations, registers everything) and
  the `container` singleton.
- Registration modules: `packages/core/src/infrastructure/di/modules/register-*.ts`
  (repositories, services, use cases, agents, tools, security, plugins, ASPM, …).
- Ports are registered under **string tokens** matching the interface name, and resolved the
  same way:

```ts
const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
const showFeature = container.resolve(ShowFeatureUseCase); // concrete classes resolve by type
```

Rules:

- Use cases receive their ports via `@inject('IPortName')` constructor parameters — never by
  importing an infrastructure module.
- Presentation code (CLI/TUI/Web) may resolve from the container, but only to reach a **use
  case**; business logic never lives in a command or component.
- Module-level singletons and global accessors (`getSettings()`, `getShepHomeDir()`) belong to
  infrastructure bootstrapping. Do not call them from use cases — inject instead, so tests can
  substitute a double without patching modules.

See [docs/architecture/repository-pattern.md](./docs/architecture/repository-pattern.md).

## Data Storage

Everything Shep knows lives locally. There is no Shep server; the only outbound data Shep
itself produces is opt-out **usage metrics** (spec 133): every process writes content-free
events to the `telemetry_outbox` table and only the daemon / `shep ui` sends them to PostHog
(EU, `/batch/`). Record events through the `ITelemetry` port with a typed property map
(`TelemetryEventPropertyMap`) — never prompts, code, paths, repo/branch names, titles, ids or
error messages. See [docs/telemetry.md](./docs/telemetry.md).

| Path | What |
| ---- | ---- |
| `~/.shep/data` | SQLite database (features, agent runs, settings, activity log, …) |
| `~/.shep/daemon.json` | Running daemon's pid/port record |
| `~/.shep/daemon.log` | Daemon log |
| `~/.shep/logs/` | Feature-agent process logs |
| `~/.shep/repos/<repo-hash>/wt/<branch>` | Per-feature git worktrees |

`SHEP_HOME` overrides `~/.shep` (used for test isolation); `DEBUG_SQL` makes better-sqlite3 log
every statement; `DEBUG` (any truthy value — it is a plain truthy check, not a namespace filter)
turns on verbose CLI/deployment logging. The web daemon's port comes from `shep start --port` /
`shep ui --port`, not an env var — `SHEP_WEB_PORT` is *written* by the server and read only by
the middleware's Host-header check. `SHEP_BIND_HOST`, `SHEP_ALLOW_PUBLIC_BIND`,
`SHEP_ALLOWED_HOSTS` and `SHEP_WEB_REQUIRE_TOKEN` gate non-localhost access.
`SHEP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1` and `CI` force usage metrics off;
`SHEP_POSTHOG_KEY` / `SHEP_POSTHOG_HOST` override the PostHog project key and host.

- Engine: `better-sqlite3`, opened as a process-wide singleton in
  `packages/core/src/infrastructure/persistence/sqlite/connection.ts`.
- Migrations: `packages/core/src/infrastructure/persistence/sqlite/migrations/`, run by **umzug**
  via `runSQLiteMigrations()` on container init. Each migration owns one change and is
  idempotent (`CREATE TABLE IF NOT EXISTS` / guarded `ALTER`).
- Repositories implementing the `application/ports/output/repositories/` interfaces live in
  `packages/core/src/infrastructure/repositories/`; row⇄entity conversion lives in
  `persistence/sqlite/mappers/`.

Per-repository files Shep reads from a target repo: `<repo>/.shep/dev.json` (dev-server run
config) and `<repo>/.shep/ownership.yaml` (ASPM ownership import). There is no
`.shep/config.json`.

## Key Docs

| Topic                          | Doc                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Architecture overview          | [docs/architecture/overview.md](./docs/architecture/overview.md)                       |
| Domain models + field listings | [docs/api/domain-models.md](./docs/api/domain-models.md)                               |
| Repository pattern + DI        | [docs/architecture/repository-pattern.md](./docs/architecture/repository-pattern.md)   |
| Agent system                   | [docs/architecture/agent-system.md](./docs/architecture/agent-system.md)               |
| Settings service               | [docs/architecture/settings-service.md](./docs/architecture/settings-service.md)       |
| TypeSpec guide                 | [docs/development/typespec-guide.md](./docs/development/typespec-guide.md)             |
| Testing guide                  | [docs/development/tdd-guide.md](./docs/development/tdd-guide.md)                       |
| Implementation patterns        | [docs/development/implementation-guide.md](./docs/development/implementation-guide.md) |
| CI/CD + Docker                 | [docs/development/cicd.md](./docs/development/cicd.md)                                 |
| Adding an agent provider       | [docs/development/adding-agent-types.md](./docs/development/adding-agent-types.md)     |
| Adding a LangGraph agent node  | [docs/development/adding-agent-nodes.md](./docs/development/adding-agent-nodes.md)     |
| Query-aware agent harness      | [docs/architecture/query-aware-harness.md](./docs/architecture/query-aware-harness.md) |
| Dev server run plans           | [docs/development/dev-server-run-plan.md](./docs/development/dev-server-run-plan.md)   |
| CLI architecture               | [docs/cli/architecture.md](./docs/cli/architecture.md)                                 |
| TUI architecture               | [docs/tui/architecture.md](./docs/tui/architecture.md)                                 |
| Web UI architecture            | [docs/ui/architecture.md](./docs/ui/architecture.md)                                   |
| pnpm workspaces + setup        | [docs/development/setup.md](./docs/development/setup.md)                               |

## General
### 1. Self-Improvement Loop
- After ANY correction from the user — including bug reports, unexpected behavior reports, and "why didn't X work?" questions — **immediately** update `LESSONS.md` (project root) with the pattern. Do NOT wait to be asked.
- This includes: bugs you fix, missing wiring you add, patterns you got wrong, anything the user had to tell you that you should have caught yourself.
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project
- Keep lessons short and concise

### 2. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it
