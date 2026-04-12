# Conventional Commits (STRICT)

You MUST output commit messages that pass ALL rules below.  
If you are asked to produce a commit message and your first attempt would violate any rule, you MUST self-correct and output only a valid commit message (no explanations).

## Format

<type>(<scope>): <subject>

## Allowed <type>

feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert

## Release-Aware Type Selection (CRITICAL)

Semantic release only publishes on `feat` (minor) and `fix` (patch). Other types (`style`, `refactor`, `perf`, `chore`, etc.) do NOT trigger a release.

**Rule: If a change is visible to end users or must be propagated to clients, use `feat` or `fix` — NEVER `style`, `refactor`, or `chore`.**

Think about it: if the change affects what users see or experience, it must reach them via a release. Choose the type based on whether the change needs to ship, not just what kind of edit it is.

| Change | Correct type | Wrong type |
|--------|-------------|------------|
| UI color/layout change visible to users | `feat` or `fix` | `style` |
| Refactor that changes API behavior | `feat` or `fix` | `refactor` |
| Performance improvement users will notice | `feat` (or `fix` if it was a perf bug) | `perf` |
| Internal code reformatting (no user impact) | `style` | — |
| Internal refactor (no user impact) | `refactor` | — |
| Dev tooling, CI config, test-only changes | `chore`, `ci`, `test` | — |

**Ask yourself: "Does the user need this change?" If yes → `feat` or `fix`.** If no → use the appropriate non-releasing type.

## Allowed <scope>

specs | shep-kit | cli | tui | web | api | domain | agents | deployment | tsp | deps | config | dx | release | ci

## <subject> rules

- MUST be lowercase only (a–z, 0–9, spaces, and hyphens only)
- MUST NOT be empty
- MUST NOT end with a period `.`
- MUST be <= 72 characters (subject only, not including `<type>(<scope>): `)
- SHOULD be an imperative phrase (e.g., "add", "fix", "remove", "refactor")

## Header rules (entire first line)

- MUST be <= 100 characters total
- MUST match this regex exactly:

^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\((specs|shep-kit|cli|tui|web|api|domain|agents|deployment|tsp|deps|config|dx|release|ci)\): [a-z0-9][a-z0-9\- ]{0,71}$

## Body / Footer (optional)

If you include a body or footer:

- MUST have a blank line after the header
- Each line MUST be <= 100 characters
- Trailers (recommended for metadata) MUST use `Token: value` format, e.g.:
  - `BREAKING CHANGE: ...`
  - `Refs: #123`
  - `Co-Authored-By: Shep Bot <shep-agent@users.noreply.github.com>`

## Output constraints

- When asked for a commit message, output ONLY the commit message text.
- Do NOT output code fences, quotes, bullets, or explanations.
- If the user request cannot be expressed within these constraints, output the closest valid commit message and keep details in the body.
