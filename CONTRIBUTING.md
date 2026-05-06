# Contributing to Shep

Thanks for being here. Shep is an AI-native SDLC platform — and one of its native abilities is helping itself. This guide gets you from a fresh clone to a merged PR, optionally using Shep's own agents along the way.

If you only have a few minutes, skim **30-Second Setup** and **Lanes**, then pick something from [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md).

- 📜 [Code of Conduct](./CODE_OF_CONDUCT.md) — be kind. Reports → **conduct@shep.bot**
- 🗺️ [Roadmap](./ROADMAP.md) — what we're building now / next / later
- 🧱 [Architecture](./ARCHITECTURE.md) — 10-minute tour of the codebase
- 🌱 [Good First Issues](./GOOD_FIRST_ISSUES.md) — curated by lane and difficulty
- 💬 [Discord](https://discord.gg/ES6tdVFfur) — say hi, ask questions, share what you're shipping

---

## 30-Second Setup

```bash
# 1. Clone
git clone https://github.com/shep-ai/shep.git && cd shep

# 2. Install
pnpm install

# 3. Verify your environment is contributor-ready
pnpm dev:cli doctor
```

`shep doctor` checks Node/pnpm/git/gh versions, available agent CLIs (Claude/Cursor/Gemini), `.env` presence, working-tree state, migration status, TypeSpec freshness, and DI graph health. It exits non-zero on any blocker and prints a `fixHint` for everything it can suggest.

If `shep doctor` is green, you're ready to ship.

```bash
# 4. (optional) build + run tests
pnpm build
pnpm test:unit
```

---

## Lanes

Every issue, PR, and contributor in Shep belongs to a **lane** — the part of the system you're touching. Lanes are real TypeSpec enum values (`ContributorLane`), not just labels: they drive issue grooming, PR routing, and the contributor leaderboard.

| Lane | What lives here | Good if you like… |
| ---- | --------------- | ----------------- |
| **docs** | `README.md`, `CONTRIBUTING.md`, `docs/`, JSDoc, `LESSONS.md` | Writing for humans; clarifying non-obvious behavior |
| **agents** | `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`, prompts | LLMs, prompts, supervisor flow, agent-agnostic plumbing |
| **ui** | `src/presentation/web/`, Storybook stories, Playwright e2e | React, Next.js, dashboards, visual polish |
| **cli** | `src/presentation/cli/`, Commander commands, terminal UX | Commander, terminal UX, structured output |
| **infra** | `infrastructure/`, migrations, DI, persistence, GitHub plumbing | SQLite, ports/adapters, queues, schedulers |

Issue templates ask you to pick a lane and a difficulty (`goodFirst | easy | medium | hard`). The contributor-onboarding agent uses both to suggest reviewers and group monthly recaps.

---

## Contributor Ladder

Shep recognises four levels. Movement is tracked automatically by `award-recognition` on every merged PR.

| Level | How to get here | What it unlocks |
| ----- | --------------- | --------------- |
| **User** | Run `npx @shepai/cli` once | The product. Filing issues. Discord access. |
| **Contributor** | One merged PR | A row in `.all-contributorsrc`, the README contributors block, and the monthly recap. |
| **Core** | Five merged PRs across at least two lanes, plus three reviews of others' PRs | Triage rights on labels, PR review assignment, vote on roadmap entries. |
| **Maintainer** | Sustained Core activity (≥ 3 months), demonstrated judgment on architectural calls, invitation by current maintainers | Merge rights, release ownership, supervisor-policy authority. |

Levels are public-by-construction: only data already on your GitHub profile (login, avatar, public PR/issue history) is used.

---

## Contributing to Shep with Shep

This is the dogfooding loop. Use Shep's own agents to land your PR.

### 1. Pick an issue, or have Shep groom one

Browse [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md), or take any open issue and run:

```bash
pnpm dev:cli contributors groom-issue --number 1234
```

The contributor-onboarding agent fetches the issue, classifies its lane (rules-first, agent fallback when ambiguous), proposes acceptance criteria as a markdown checklist, and suggests labels. Nothing is applied until the supervisor approval gate clears.

### 2. Spin up a worktree and start work

```bash
shep feat new "fix: <description from the groomed issue>"
```

Shep creates an isolated git worktree, branches from `main`, and hands the prompt to your agent of choice (Claude / Cursor / Gemini). You stay in your editor; Shep handles the boring parts.

### 3. Let Shep commit, push, and open the PR

```bash
shep feat new "..." --push --pr
```

The agent commits in conventional-commit format, pushes the branch, and opens a draft PR. CI runs your tests and security scans; if anything fails, Shep retries up to three times before pausing for human input.

### 4. First merge → automatic recognition

When your PR merges, `welcome-first-time-contributor` posts a welcome comment (gated on supervisor approval), `award-recognition` adds you to `.all-contributorsrc` and the README contributors block, and your name appears in the next monthly recap published to `recaps/YYYY-MM.md`, GitHub Discussions, and Discord.

You graduated from User to Contributor. No bot install required — Shep did it.

---

## Quick Contributions (no spec workflow needed)

For typo fixes, doc clarifications, single-file bug fixes, or dependency bumps, skip the spec workflow:

1. Fork → branch from `main` (`git checkout -b fix/your-fix-name`)
2. Make the change
3. `pnpm dev:cli doctor` (still green?)
4. `pnpm test:unit && pnpm lint`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — type and scope are enforced (`fix(docs): ...`, `feat(cli): ...`)
6. Open a PR against `main` using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

---

## Full Feature Development

For new features, architectural changes, and significant enhancements we use the spec-driven workflow.

```
/shep-kit:new-feature → /shep-kit:research → /shep-kit:plan → /shep-kit:implement → /shep-kit:commit-pr
```

This produces a versioned spec under `specs/NNN-feature-name/` with five YAML artifacts (`spec`, `research`, `plan`, `tasks`, `feature`). Edit the YAML — markdown is auto-generated. See [docs/development/spec-driven-workflow.md](./docs/development/spec-driven-workflow.md) for the full flow.

---

## Coding Standards

Before opening a PR, verify locally:

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build
```

CI mirrors this sequence; passing locally means CI passes.

### Architecture

Shep follows Clean Architecture with four layers. Dependencies point inward.

- `domain/` — TypeSpec-generated types and pure business logic. No external deps.
- `application/` — Use cases and output port interfaces. No infrastructure imports.
- `infrastructure/` — Adapters: SQLite, agents, GitHub, file system, Discord. Behind ports.
- `presentation/` — CLI, TUI, web. Calls only use cases.

If you find yourself importing from `infrastructure/` outside `infrastructure/`, define a port in `application/ports/output/` instead. See [docs/architecture/clean-architecture.md](./docs/architecture/clean-architecture.md).

### TDD is mandatory

Every use case lands RED-first: a failing test that describes intent, then the smallest code that turns it green, then refactor. See [docs/development/tdd-guide.md](./docs/development/tdd-guide.md).

### TypeSpec-first

Domain models live in `tsp/`. Run `pnpm tsp:compile` to regenerate `packages/core/src/domain/generated/output.ts`. Never edit the generated file. See [docs/development/typespec-guide.md](./docs/development/typespec-guide.md).

### File length

No new file over ~300 lines of focused code. If you need to add to a long file, refactor it first.

### Storybook is mandatory for web components

Every component under `src/presentation/web/components/` ships with a colocated `.stories.tsx` covering Default, Loading, Empty, and Error states. PRs without stories are rejected.

---

## Commit Format

[Conventional Commits](https://www.conventionalcommits.org/) — strict.

```
<type>(<scope>): <subject>
```

- **types**: `feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert`
- **scopes**: `specs | shep-kit | cli | tui | web | api | domain | agents | deployment | tsp | deps | config | dx | release | ci`
- **subject**: lowercase, ≤ 72 chars, imperative ("add", "fix", "remove")

Use `feat` or `fix` for anything users will see — those trigger releases. `style`, `refactor`, `chore`, `test`, `ci`, `build`, `docs` do not.

---

## PR Process

1. Open against `main` using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)
2. Fill in **What**, **Why**, **Screenshots / Recording** (UI changes), **Testing**, **Checklist**
3. CI must be green (lint, typecheck, unit, integration, build, Storybook)
4. A maintainer reviews; small PRs get reviewed faster
5. Squash merge; semantic-release publishes on `feat`/`fix` to `main`

---

## Reporting Issues

Use the issue templates — they collect lane, difficulty, and acceptance criteria so the grooming agent can pick up where you left off.

- 🐛 [Bug Report](./.github/ISSUE_TEMPLATE/bug-report.yml)
- 💡 [Feature Request](./.github/ISSUE_TEMPLATE/feature-request.yml)
- 📚 [Docs Improvement](./.github/ISSUE_TEMPLATE/docs-improvement.yml)
- 🌱 [Good First Issue](./.github/ISSUE_TEMPLATE/good-first-issue.yml)

Search existing issues first. Include `shep doctor` output for environment bugs.

---

## Questions?

- 💬 [Discord](https://discord.gg/ES6tdVFfur) — fastest path to a human
- 💭 [GitHub Discussions](https://github.com/shep-ai/shep/discussions) — searchable archive
- 📧 conduct@shep.bot — Code of Conduct concerns

---

## Maintaining This Document

Update CONTRIBUTING.md when:

- The contribution flow changes (new commands, new gates, new lanes)
- A lane is added, renamed, or removed
- The contributor ladder criteria change
- A new top-level doc joins the navigation block

**Related docs:**

- [docs/development/spec-driven-workflow.md](./docs/development/spec-driven-workflow.md) — full spec workflow
- [docs/development/tdd-guide.md](./docs/development/tdd-guide.md) — TDD rhythm
- [docs/development/contributing-with-shep.md](./docs/development/contributing-with-shep.md) — extended walk-through of the dogfooding loop
- [docs/development/setup.md](./docs/development/setup.md) — detailed dev environment setup
