# Good First Issues

A curated list of issues that are well-scoped, well-described, and a good place to start. Grouped by **lane** (the part of the system you'll touch) and by **difficulty** (`goodFirst` is the easiest tier).

If nothing here looks like a fit, search the issue tracker with the [`good first issue` label](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) directly, or open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml) for something you'd like to build.

> **How this list is maintained**
> The contributor-onboarding agent grooms inbound issues into lanes and difficulty tiers. Maintainers refresh this list during the monthly recap. If an issue here is already claimed or has gone stale, it'll be re-groomed and either reopened or replaced.
>
> **Status Aug 28, 2026:** All 11 previously curated entries (#615–#625) are now closed — 6 merged (#616, #617, #618, #619, #620, #622), 2 deleted (#615, #623), and 3 closed as not planned (#621, #624, #625). Each bucket below links to a live tracker search for that lane and difficulty.

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

- _No curated issues right now_ — #615 was deleted; #616 merged via #632. [Browse open `lane:docs` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — [Browse open `lane:docs` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:docs` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Adocs%22+label%3A%22difficulty%3Amedium%22).

---

## agents lane

*Agent prompts, supervisor flow, agent-agnostic plumbing under `tsp/agents/`, `application/use-cases/agents/`, `infrastructure/agents/`.*

### goodFirst

- _No curated issues right now_ — #618 merged via #631. [Browse open `lane:agents` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #617 merged via #627. [Browse open `lane:agents` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:agents` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aagents%22+label%3A%22difficulty%3Amedium%22).

---

## ui lane

*Web dashboard under `src/presentation/web/`, Storybook stories, Playwright e2e.*

### goodFirst

- _No curated issues right now_ — #619 merged via #633; #620 merged via #635. [Browse open `lane:ui` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #621 closed as not planned. [Browse open `lane:ui` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:ui` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Aui%22+label%3A%22difficulty%3Amedium%22).

---

## cli lane

*Commander commands, terminal UX, structured output under `src/presentation/cli/`.*

### goodFirst

- _No curated issues right now_ — #622 merged via #630. [Browse open `lane:cli` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #623 was deleted. [Browse open `lane:cli` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — [Browse open `lane:cli` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Acli%22+label%3A%22difficulty%3Amedium%22).

---

## infra lane

*SQLite, ports/adapters, queues, schedulers, GitHub plumbing under `infrastructure/`.*

### goodFirst

- _No curated issues right now_ — [Browse open `lane:infra` + `difficulty:goodFirst` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3AgoodFirst%22).

### easy

- _No curated issues right now_ — #624 closed as not planned. [Browse open `lane:infra` + `difficulty:easy` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3Aeasy%22).

### medium

- _No curated issues right now_ — #625 closed as not planned. [Browse open `lane:infra` + `difficulty:medium` issues](https://github.com/shep-ai/shep/issues?q=is%3Aissue+is%3Aopen+label%3A%22lane%3Ainfra%22+label%3A%22difficulty%3Amedium%22).

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
