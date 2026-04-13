# Clean Architecture Violations — Incremental Log

This file is appended to throughout the research and implementation of feature `089-one-click-cloud-deploy`. Every time a file is read in the course of this feature's work and a Clean Architecture violation is noticed, a new entry is added here.

**Rules enforced** (from `.claude/rules/code-quality.md` and `CLAUDE.md`):

- Use cases are the only entry point from presentation to core.
- Presentation contains no business logic.
- Application layer imports only from domain + its own ports.
- Presentation imports only from use cases + domain types.
- No direct `infrastructure/` imports in application or presentation layers.
- No hardcoded agent type — all resolution via `IAgentExecutorProvider`.
- No singletons or global state outside infrastructure bootstrapping.
- No magic string/number literals for domain concepts — use TypeSpec enums.
- Files stay focused; >~300 lines is a refactor signal.
- No duplication (two = coincidence, three = pattern to extract).

**Severity scale:**

- **Critical** — breaks the dependency rule (outer imports inner impl) or hardcodes something that must be pluggable (agent type, provider, db).
- **Major** — presentation or application has real business logic, a banned singleton, or duplicated logic that should be shared.
- **Minor** — magic literal, over-long file, missing port abstraction that isn't yet needed, stylistic drift from patterns.

**Format for each entry:**

```
### N. <short title>
- **File:** `<path>:<line-range>`
- **Severity:** Minor | Major | Critical
- **Observation:** <what is wrong>
- **Suggested fix:** <what to do>
- **Found during:** <research / implementation of which task>
```

At the end of the research phase, `/shep-kit:plan` MUST ingest this file and produce an explicit "tech-debt cleanup" task group in `tasks.yaml` covering every entry. Per user instruction: **"we will need to consider fixing EVERYTHING."**

---

## Findings

_None yet — entries will be appended as files are read during research and implementation._
