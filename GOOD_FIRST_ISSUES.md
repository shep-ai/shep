# Good First Issues

A curated list of issues that are well-scoped, well-described, and a good place to start. Grouped by **lane** (the part of the system you'll touch) and by **difficulty** (`goodFirst` is the easiest tier).

If nothing here looks like a fit, search the issue tracker with the [`good first issue` label](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) directly, or open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml) for something you'd like to build.

> **How this list is maintained**
> The contributor-onboarding agent grooms inbound issues into lanes and difficulty tiers. Maintainers refresh this list during the monthly recap. If an issue here is already claimed or has gone stale, it'll be re-groomed and either reopened or replaced.

---

## How to claim

1. Comment `/claim` on the issue (or just say "I'd like to take this") so we don't double-assign
2. Run `pnpm dev:cli doctor` to verify your environment
3. Optionally: `pnpm dev:cli contributors groom-issue --number <issue>` to get acceptance criteria + lane suggestion from the contributor-onboarding agent
4. Open a PR using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full flow.

---

## docs lane

*Documentation, READMEs, JSDoc, contributor docs, lessons.*

### goodFirst

- [#615 — fix 5 broken docs links from docs/README.md and ARCHITECTURE.md](https://github.com/shep-ai/shep/issues/615)
- [#616 — add JSDoc to spec-097 contributor use-case public interfaces](https://github.com/shep-ai/shep/issues/616)

### easy

- _No curated issues right now_ — search [docs + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22documentation%22) directly.

### medium

- _No curated issues right now._

---

## agents lane

*Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`.*

### goodFirst

- [#618 — resolve Coming Soon agent placeholders in TUI docs](https://github.com/shep-ai/shep/issues/618)

### easy

- [#617 — document the contributor-onboarding agent in docs/agents/](https://github.com/shep-ai/shep/issues/617)

### medium

- _No curated issues right now._

---

## ui lane

*Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.*

### goodFirst

- [#619 — add Storybook stories for 5 shadcn UI primitives](https://github.com/shep-ai/shep/issues/619)
- [#620 — add interaction-state stories for DoctorSummary](https://github.com/shep-ai/shep/issues/620)

### easy

- [#621 — internationalize spec-097 contributor web components](https://github.com/shep-ai/shep/issues/621)

### medium

- _No curated issues right now._

---

## cli lane

*Commander commands, terminal UX, structured output under `src/presentation/cli/`.*

### goodFirst

- [#622 — add --help example blocks to 6 user-facing CLI commands](https://github.com/shep-ai/shep/issues/622)

### easy

- [#623 — add unit tests for shep contributors groom-issue and welcome-pr](https://github.com/shep-ai/shep/issues/623)

### medium

- _No curated issues right now._

---

## infra lane

*SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `infrastructure/`.*

### goodFirst

- _No curated issues right now_ — search [infra + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22infrastructure%22+label%3A%22good+first+issue%22) directly.

### easy

- [#624 — seed deterministic fixtures for optimistic-node-clickability e2e](https://github.com/shep-ai/shep/issues/624)

### medium

- [#625 — auto-regenerate GOOD_FIRST_ISSUES.md from live GitHub labels](https://github.com/shep-ai/shep/issues/625)

---

## When this list is empty

It usually means the curated buffer is being refreshed, not that there's nothing to do. Two reliable next steps:

1. Search the live tracker for [open `good first issue` labels](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — anything there is fair game.
2. Drop into [Discord](https://discord.gg/ES6tdVFfur) and ask "what should I work on?" — a maintainer will route you.

You can also open a [Good First Issue](./.github/ISSUE_TEMPLATE/good-first-issue.yml) yourself if you spot something a future contributor could pick up.

---

## Related

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [ROADMAP.md](./ROADMAP.md) — what's shipping next
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 10-minute tour of the codebase
