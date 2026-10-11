# Contributing to Shep

Thanks for being here. Shep is an AI-native SDLC platform — and one of its native abilities is helping itself. This guide gets you from a fresh clone to a merged PR, optionally using Shep's own agents along the way.

If you only have a few minutes, skim **30-Second Setup** and **Lanes**, then pick something from [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md).

- 📜 [Code of Conduct](./CODE_OF_CONDUCT.md) — be kind. Reports → **conduct@shep.bot**
- 🗺️ [Roadmap](./ROADMAP.md) — what we're building now / next / later
- 🧱 [Architecture](./ARCHITECTURE.md) — 10-minute tour of the codebase
- 🌱 [Good First Issues](./GOOD_FIRST_ISSUES.md) — grouped by lane and difficulty, with links to the live tracker
- 💬 [Discord](https://discord.gg/ES6tdVFfur) — say hi, ask questions, share what you're shipping

---

## 30-Second Setup

**Prerequisites:** **Node 22** (`.nvmrc` pins `22`; `engines.node` is `>=22.0.0`, and every workflow runs `node-version: '22'`) and **pnpm 10** (`packageManager` pins `pnpm@10.33.0`; `engines.pnpm` requires `>=10.0.0`). The minimum pnpm version was raised from 8 to 10 to match the toolchain used in CI. Run `corepack enable` and pnpm will pick up the pinned version for you.

```bash
# 1. Clone
git clone https://github.com/shep-ai/shep.git && cd shep

# 2. Install
pnpm install

# 3. Verify your environment is contributor-ready
pnpm dev:cli doctor
```

`doctor` runs ten diagnostics: Node version, pnpm, git, `gh` auth, agent-CLI availability, `.env` presence, working-tree state, migration status, TypeSpec freshness, and DI graph health (`packages/core/src/application/use-cases/doctor/diagnostics/`). It exits non-zero on any blocker and prints a `fixHint` for everything it can suggest.

If the doctor report is green, you're ready to ship.

```bash
# 4. (optional) build + run tests
pnpm build          # CLI only — `build:release` is the one CI uses
pnpm test:unit
```

> **`shep` vs `pnpm dev:cli`.** A bare `shep` on your `PATH` comes from a global install (`npm i -g @shepai/cli`). Nothing in the steps above builds `dist/` or links the binary, so inside a clone run the CLI as **`pnpm dev:cli <command>`** — it is the same entry point (`tsx src/presentation/cli/index.ts`) and it is what CI uses too.

### Supported agents

Shep drives whichever agent you already use. Twelve are supported today; the list of record is `AGENT_CATALOG` in [`packages/core/src/domain/shared/agent-catalog.ts`](./packages/core/src/domain/shared/agent-catalog.ts), and `doctor`'s agent probe is derived from it rather than hand-written.

| Kind                     | Agents                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI (binary on `PATH`)   | Claude Code (`claude`), Kimi Code (`kimi`), Codex CLI (`codex`), Copilot CLI (`copilot`), Cursor CLI (`cursor-agent`), Gemini CLI (`gemini`), Cline (`cline`) |
| SDK (API token)          | OpenRouter, Together AI, Ollama, LLM Proxy                                                                                                    |
| Mock                     | Demo (`dev`) — no binary, no network                                                                                                          |

Cursor's binary is **`cursor-agent`**; plain `cursor` is the desktop editor. Aider and Continue have catalog rows but are marked *Coming Soon* — neither has an executor yet.

---

## Lanes

Every issue, PR, and contributor in Shep belongs to a **lane** — the part of the system you're touching. Lanes are real TypeSpec enum values (`ContributorLane`), not just labels: they drive issue grooming, PR routing, and the contributor leaderboard.

| Lane | What lives here | Good if you like… |
| ---- | --------------- | ----------------- |
| **docs** | `README.md`, `CONTRIBUTING.md`, `docs/`, JSDoc, `LESSONS.md` | Writing for humans; clarifying non-obvious behavior |
| **agents** | `tsp/agents/`, `packages/core/src/application/use-cases/agents/`, `packages/core/src/infrastructure/services/agents/`, prompts | LLMs, prompts, supervisor flow, agent-agnostic plumbing |
| **ui** | `src/presentation/web/`, Storybook stories, Playwright e2e | React, Next.js, dashboards, visual polish |
| **cli** | `src/presentation/cli/`, Commander commands, terminal UX | Commander, terminal UX, structured output |
| **infra** | `packages/core/src/infrastructure/`, migrations, DI, persistence, GitHub plumbing | SQLite, ports/adapters, queues, schedulers |

Issue templates ask you to pick a lane and a difficulty (`goodFirst | easy | medium | hard`). The contributor-onboarding agent uses both to suggest reviewers and group monthly recaps.

---

## Contributor Ladder

Shep recognises four levels, and the only input is **merged PR count**. `AwardRecognitionUseCase` ([`packages/core/src/application/use-cases/contributors/award-recognition.use-case.ts`](./packages/core/src/application/use-cases/contributors/award-recognition.use-case.ts)) derives your level from `prCount` and nothing else — there are no quality, review, lane-spread or tenure criteria anywhere in the code.

| Level | Threshold | What it unlocks |
| ----- | --------- | --------------- |
| **User** | The default — run `npx @shepai/cli` once | The product. Filing issues. Discord access. |
| **Contributor** | **≥ 1** merged PR | A row in `.all-contributorsrc` and a mention in the monthly recap. |
| **Core** | **≥ 5** merged PRs | Triage rights on labels, PR review assignment, vote on roadmap entries. |
| **Maintainer** | **≥ 25** merged PRs | Merge rights, release ownership, supervisor-policy authority. |

> **Not wired up yet.** `AwardRecognitionUseCase` is implemented and unit-tested, but nothing invokes it: it has no CLI command and no workflow triggers on `pull_request: closed`. Until that lands, levels and `.all-contributorsrc` are maintained by hand — the file's `contributors` list is currently empty. If automating this appeals to you, it is a genuinely good first issue.

Levels are public-by-construction: only data already on your GitHub profile (login, avatar, public PR/issue history) is used.

---

## Contributing to Shep with Shep

This is the dogfooding loop. Use Shep's own agents to land your PR.

### 1. Pick an issue, or have Shep groom one

Browse [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md), or take any open issue. Grooming is already automatic: `.github/workflows/label-by-lane.yml` fires on `issues: [opened]` and runs

```bash
pnpm dev:cli contributors groom-issue
```

`groom-issue` takes **no options** — there is no `--number`. It reads the issue from `$GITHUB_EVENT_PATH` and the repo slug from `$GITHUB_REPOSITORY`, both set by GitHub Actions. To run it by hand, feed it a saved event payload:

```bash
GITHUB_EVENT_PATH=event.json GITHUB_REPOSITORY=shep-ai/shep pnpm dev:cli contributors groom-issue
```

The contributor-onboarding agent fetches the issue, classifies its lane (rules-first, agent fallback when ambiguous), proposes acceptance criteria as a markdown checklist, and suggests labels. Nothing is applied until the supervisor approval gate clears.

### 2. Spin up a worktree and start work

```bash
pnpm dev:cli feat new "fix: <description from the groomed issue>"
```

Shep creates an isolated git worktree, branches from `main`, and hands the prompt to your configured agent — any of the twelve in [Supported agents](#supported-agents). You stay in your editor; Shep handles the boring parts.

### 3. Let Shep commit, push, and open the PR

```bash
pnpm dev:cli feat new "..." --push --pr
```

The agent commits in conventional-commit format, pushes the branch, and opens a draft PR. CI runs your tests and security scans; if anything fails, Shep retries up to three times before pausing for human input.

### 4. First PR → automatic welcome

When you **open** your first PR — not when it merges — [`.github/workflows/welcome-first-time-contributor.yml`](./.github/workflows/welcome-first-time-contributor.yml) (trigger: `pull_request: [opened]`) runs `pnpm dev:cli contributors welcome-pr`, which posts a welcome comment gated on supervisor approval. It is a no-op for returning contributors.

Recognition itself is not automated yet — see the note under [Contributor Ladder](#contributor-ladder). Monthly recaps go to `recaps/YYYY-MM.md`, GitHub Discussions, and Discord via the publishers in `packages/core/src/infrastructure/services/recap/`.

Cadence-driven maintenance runs in [`.github/workflows/contributor-maintenance.yml`](./.github/workflows/contributor-maintenance.yml), never on users' machines: `pnpm dev:cli contributors stale-issues` lists good-first-issues with no activity for 30 days (daily), and `pnpm dev:cli contributors recap` writes the previous month's recap (monthly). Both read the same use cases you can run locally.

With the web UI running (`pnpm dev:web`) and the Collaboration flag on, `/contributors` shows the lane chooser, the contributor leaderboard and the doctor summary. It is not in the sidebar — it is tooling for working on Shep, not for using it.

---

## Quick Contributions (no spec workflow needed)

For typo fixes, doc clarifications, single-file bug fixes, or dependency bumps, skip the spec workflow:

1. Fork → branch from `main` (`git checkout -b fix/your-fix-name`)
2. Make the change
3. `pnpm dev:cli doctor` (still green?)
4. `pnpm test:unit && pnpm lint`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — the **type** is enforced; the **scope** is optional and only warns (`docs(cli): ...`, `feat(cli): ...`). See [Commit Format](#commit-format).
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
pnpm validate && pnpm test:unit && pnpm test:int && pnpm build
```

(`pnpm validate` = `lint:fix` + `format` + `typecheck` + `tsp:compile`.)

**Green locally does not mean green in CI.** `.github/workflows/ci.yml` runs a strictly larger set, and every one of these can fail on a branch that passes the command above:

- `pnpm format:check` and `pnpm tsp:compile` (**Lint & Format**)
- `pnpm generate` plus a *verify generated code is committed* check — an uncommitted regeneration fails the build (**Type Check**)
- unit + integration tests on an **OS matrix**, not just yours (**Unit Tests**)
- `pnpm build:release` (CLI **and** web — `pnpm build` is CLI only) followed by the CLI e2e suite on an OS matrix (**E2E CLI**)
- **E2E (TUI)** and **E2E (Web)** (Playwright)
- `pnpm check:stories` + `pnpm build:storybook` (**Storybook Build**)
- **Electron** and **Electron Apps-Only** installer builds on macOS, Windows and Linux
- the three security gates: **Gitleaks**, **Semgrep**, **Security Enforce** — see [SECURITY.md](./SECURITY.md#security-gates-in-ci)

Separately, `.github/workflows/pr-check.yml` lints every commit message in the PR range and validates the PR title.

If you only have time for one extra command before pushing, make it `pnpm format:check` — it is the cheapest of the above and the most common CI-only failure.

### Architecture

Shep follows Clean Architecture with four layers. Dependencies point inward. The first three live in `packages/core/src/`; presentation lives in `src/presentation/`.

- `packages/core/src/domain/` — TypeSpec-generated types (`domain/generated/output.ts`) and pure business logic. No external deps.
- `packages/core/src/application/` — Use cases (`use-cases/`) and output port interfaces (`ports/output/`). No infrastructure imports.
- `packages/core/src/infrastructure/` — Adapters: SQLite (`persistence/sqlite/`), agents (`services/agents/`), GitHub, file system, Discord. Behind ports.
- `src/presentation/` — CLI (`cli/`), TUI (`tui/`), web (`web/`). Calls use cases.

`application/` and `domain/` must never import from `infrastructure/` — define a port in `packages/core/src/application/ports/output/` instead. `src/presentation/` may import from infrastructure, but only to resolve the DI container; business logic still goes through a use case. See [docs/architecture/clean-architecture.md](./docs/architecture/clean-architecture.md).

### TDD is mandatory

Every use case lands RED-first: a failing test that describes intent, then the smallest code that turns it green, then refactor. See [docs/development/tdd-guide.md](./docs/development/tdd-guide.md).

### TypeSpec-first

Domain models live in `tsp/`. Run **`pnpm generate`** to regenerate `packages/core/src/domain/generated/output.ts` — `pnpm tsp:compile` only type-checks the TypeSpec and emits nothing. Never edit the generated file, and do commit it: CI re-runs `pnpm generate` and fails if the result differs from what you pushed (the `pre-commit` hook stages it for you). See [docs/development/typespec-guide.md](./docs/development/typespec-guide.md).

### File length

Aim to keep new files under ~300 lines of focused code, and refactor a long file before piling more onto it. This one is guidance, not a gate: there is no ESLint `max-lines` rule and plenty of existing files are longer, so a reviewer may push back but CI will not.

### Storybook is mandatory for web components

Every component under `src/presentation/web/components/` ships with a colocated `.stories.tsx` covering Default, Loading, Empty, and Error states. PRs without stories are rejected.

---

## Commit Format

[Conventional Commits](https://www.conventionalcommits.org/) — strict.

```
<type>(<scope>): <subject>
```

- **types** (enforced — `type-enum` is severity 2): `feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert`
- **scopes** (**optional**): `specs | shep-kit | cli | tui | web | api | domain | agents | deployment | tsp | deps | config | dx | release | ci`
- **subject**: ≤ 72 chars, no trailing period, imperative ("add", "fix", "remove")

The scope is not mandatory. `scope-enum` is severity **1** in `commitlint.config.mjs`, so an unknown or missing scope is a warning, and `.github/workflows/pr-check.yml` sets `requireScope: false` for PR titles. Note that `docs` and `build` are *types*, never scopes — `docs(cli)` is right, `fix(docs)` is not.

Subject **case is not enforced**: `commitlint.config.mjs` sets `'subject-case': [0]`, which disables the rule outright. Sentence case, lowercase and mixed all pass.

Release impact comes from `release.config.mjs`:

| Types | Release |
| ----- | ------- |
| `feat` | minor |
| `fix`, `perf`, `revert`, **`refactor`** | patch |
| `docs`, `style`, `test`, `build`, `ci`, `chore` | none |

`refactor` **does** publish a patch release — pick it deliberately, not as a catch-all.

---

## What happens on your first `git commit`

Shep installs git hooks with [husky](https://typicode.github.io/husky/) (`.husky/`). Three of them run, in this order:

1. **`pre-commit`** — runs `pnpm generate`, then `git add apis/json-schema/ packages/core/src/domain/generated/` so regenerated output lands in your commit, then `pnpm exec lint-staged`. For staged `.ts`/`.tsx` files lint-staged runs `eslint --fix --max-warnings 0`, `prettier --write`, **and a whole-project `pnpm run typecheck`** — so a type error anywhere in the repo blocks your commit, even in a file you never touched. Staged `.tsp` files also trigger `pnpm run tsp:compile`.
2. **`prepare-commit-msg`** — **this hook rewrites your commit message.** It deletes any `Co-Authored-By: Claude … <noreply@anthropic.com>` trailer and appends `Co-Authored-By: Shep Bot <shep-agent@users.noreply.github.com>` if it is not already present. The project attributes all commits to Shep Bot on purpose, but it does mean the message you typed is not always the message that lands.
3. **`commit-msg`** — runs `pnpm exec commitlint --edit`, enforcing [Commit Format](#commit-format).

The first commit in a fresh clone is therefore slower than you expect (a full `generate` + `typecheck`), and it can fail for reasons unrelated to your diff. That is the hook, not you.

---

## PR Process

1. Open against `main` using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)
2. Fill in **What**, **Why**, **Screenshots / Recording** (UI changes), **Testing**, **Checklist**
3. CI must be green — all of it (see [Coding Standards](#coding-standards) for what "all of it" covers)
4. A maintainer reviews; small PRs get reviewed faster
5. Squash merge; semantic-release publishes when a `feat`, `fix`, `perf`, `refactor` or `revert` commit lands on `main`

---

## Reporting Issues

Use the issue templates — they collect lane, difficulty, and acceptance criteria so the grooming agent can pick up where you left off.

- 🐛 [Bug Report](./.github/ISSUE_TEMPLATE/bug-report.yml)
- 💡 [Feature Request](./.github/ISSUE_TEMPLATE/feature-request.yml)
- 📚 [Docs Improvement](./.github/ISSUE_TEMPLATE/docs-improvement.yml)
- 🌱 [Good First Issue](./.github/ISSUE_TEMPLATE/good-first-issue.yml)

Search existing issues first. Include `pnpm dev:cli doctor` output for environment bugs.

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
- The contributor ladder thresholds change, or recognition finally gets wired to a trigger
- `AGENT_CATALOG` gains or loses a supported agent
- A `.husky/` hook, a CI job, or a commitlint/semantic-release rule changes
- A new top-level doc joins the navigation block

**Related docs:**

- [docs/development/spec-driven-workflow.md](./docs/development/spec-driven-workflow.md) — full spec workflow
- [docs/development/tdd-guide.md](./docs/development/tdd-guide.md) — TDD rhythm
- [docs/development/contributing-with-shep.md](./docs/development/contributing-with-shep.md) — extended walk-through of the dogfooding loop
- [docs/development/setup.md](./docs/development/setup.md) — detailed dev environment setup
