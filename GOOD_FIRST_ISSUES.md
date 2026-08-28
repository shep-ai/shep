# Good First Issues

A curated list of issues that are well-scoped, well-described, and a good place to start. Grouped by **lane** (the part of the system you'll touch) and by **difficulty** (`goodFirst` is the easiest tier).

If nothing here looks like a fit, search the issue tracker with the [`good first issue` label](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) directly, or open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml) for something you'd like to build.

> **How this list is maintained**
> The contributor-onboarding agent grooms inbound issues into lanes and difficulty tiers. Maintainers refresh this list during the monthly recap. If an issue here is already claimed or has gone stale, it'll be re-groomed and either reopened or replaced.
> **Status Aug 28, 2026:** All 11 curated entries (#615-#625) have been closed/merged (see #630-#635). Search the live tracker below for current `good first issue` labels.

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

- _No curated issues right now_ — all recent `goodFirst` docs items (#615, #616) have been merged (see #630, #632). Search [docs + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+label%3A%22documentation%22) live.

### easy

- _No curated issues right now_ — search [docs + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22documentation%22) directly.

### medium

- _No curated issues right now._

---

## agents lane

*Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`.*

### goodFirst

- _No curated issues right now_ — #618 has been merged (see #631). Search [agents + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+label%3A%22agents%22) live.

### easy

- _No curated issues right now_ — #617 has been merged (see #627). Search [agents + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22easy%22+label%3A%22agents%22) live.

### medium

- _No curated issues right now._

---

## ui lane

*Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.*

### goodFirst

- _No curated issues right now_ — #619, #620 have been merged (see #633, #635). Search [ui + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+label%3A%22ui%22) live.

### easy

- _No curated issues right now_ — #621 closed as not planned. Search [ui + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22easy%22+label%3A%22ui%22) live.

### medium

- _No curated issues right now._

---

## cli lane

*Commander commands, terminal UX, structured output under `src/presentation/cli/`.*

### goodFirst

- _No curated issues right now_ — #622 has been merged (see #630). Search [cli + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+label%3A%22cli%22) live.

### easy

- _No curated issues right now_ — #623 was deleted. Search [cli + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22easy%22+label%3A%22cli%22) live.

### medium

- _No curated issues right now._

---

## infra lane

*SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `infrastructure/`.*

### goodFirst

- _No curated issues right now_ — search [infra + good first issue](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22infrastructure%22+label%3A%22good+first+issue%22) directly.

### easy

- _No curated issues right now_ — #624 closed as not planned. Search [infra + easy](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22infrastructure%22+label%3A%22easy%22) live.

### medium

- _No curated issues right now_ — #625 closed as not planned. This list is now auto-refreshed via the note above.

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
