---
prompt-id: shep.generate-good-first-issues
prompt-version: 1.0.0
output-target: github issues in shep-ai/shep (labels: good first issue + ai-generated + lane:* + difficulty:*)
invoke-as: subagent
---

# Shep — Good-First-Issue Generator

Single source of truth for the daily good-first-issue agent. Invoked
on cron (once a day) and manually. The agent's output is N new GitHub
issues opened in `shep-ai/shep` via `gh issue create`.

## Mission

Surface up to **10 NEW good-first-issues per run** that:

1. Are genuinely implementable in the shep codebase (reference real
   files / features / surfaces that exist today).
2. Are inspired by what's happening in AI right now — new model
   releases, what other coding agents (Cursor, Claude Code, Aider,
   Cline, OpenCode, Codex, Windsurf, Continue, Codium) just shipped,
   patterns trending on HN / r/LocalLLaMA / HuggingFace.
3. Are small enough for a newcomer to land in a few hours.

**Empty run is a successful run.** If nothing today clears the
inclusion bar, ship zero. Padding to hit 10 is the bug — three
iterations of that pattern killed ai-tldr's data quality. Do not
repeat it here.

## The pipeline (one canonical path)

You do NOT edit files in the repo. You read the codebase + external
trends, then open issues via `gh`. That's it.

1. **Briefing — load context.** Read in this order:
   - `CLAUDE.md` (project rules + mandatory practices)
   - `LESSONS.md` (hard-won lessons — never repeat these)
   - `docs/architecture/overview.md` (layer model)
   - `docs/cli/architecture.md`, `docs/ui/architecture.md`,
     `docs/tui/architecture.md` (presentation surfaces)
   - `docs/architecture/agent-system.md` (agent plumbing)

2. **Dedup briefing — load the no-create list.** Run:
   ```bash
   gh issue list --repo shep-ai/shep --state all \
     --label "good first issue" --limit 200 \
     --json number,title,state,labels,body > /tmp/existing-gfi.json
   gh issue list --repo shep-ai/shep --state all \
     --label "ai-generated" --limit 200 \
     --json number,title,state,labels > /tmp/existing-ai-generated.json
   ```
   These two lists are your dedup corpus. Read both before drafting
   anything. **Every candidate you consider MUST be compared
   semantically against both lists.**

3. **Trend briefing — load what shipped this week in AI.** Fetch:
   ```bash
   curl -fsSL \
     https://raw.githubusercontent.com/blackpc/ai-tldr/master/src/data/releases.json \
     > /tmp/ai-trends.json
   ```
   Read the top 30 items (most recent first). Note categories,
   tags, and orgs. These are not issues to file — they are
   **inspiration vectors**. For each notable item, ask: "Does this
   suggest a missing affordance, doc, story, or test in shep?"

4. **Codebase scan — find real gaps.** Use Grep / Glob to find
   concrete, addressable surface area. Examples of *grounded* signals:
   - `TODO` / `FIXME` / `XXX` comments older than 30 days
   - Web components in `src/presentation/web/components/` without a
     colocated `.stories.tsx` (mandatory rule — see CLAUDE.md)
   - Public exported functions/classes in `application/use-cases/`
     missing JSDoc
   - CLI commands in `src/presentation/cli/commands/` whose `--help`
     output has no example block
   - Broken relative links in `docs/**/*.md`
   - Tests skipped via `it.skip` / `xit` / `test.skip` with no
     tracking issue linked
   - Adapters in `infrastructure/` referencing AI providers that
     trail current model availability (e.g., hardcoded model IDs
     that are now superseded — cross-reference against the trends
     file)

5. **Synthesize candidates.** For each candidate, draft a
   `[Good First Issue]: <imperative phrase>` title and a body
   following the schema below. Cite REAL file paths with line
   numbers. If you cannot cite a real file, the candidate is
   ungrounded — drop it.

6. **Apply the inclusion bar** (next section) to each candidate.
   Reject anything that does not pass.

7. **Apply semantic dedup** against `/tmp/existing-gfi.json` and
   `/tmp/existing-ai-generated.json`. Reject anything that overlaps
   with an existing issue's intent — even if the wording is
   different. Closed + reopened both count.

8. **Cap at 10.** If more than 10 pass, keep the 10 strongest. If
   fewer than 10 pass, ship what you have. **Zero is fine.**

9. **Open issues.** For each surviving candidate, run:
   ```bash
   gh issue create --repo shep-ai/shep \
     --title "[Good First Issue]: <phrase>" \
     --body-file /tmp/issue-N.md \
     --label "good first issue" \
     --label "ai-generated" \
     --label "lane:<lane>" \
     --label "difficulty:<difficulty>" \
     --label "area: <area>"   # optional, only if it cleanly maps
   ```
   Where:
   - `<lane>` ∈ { `docs`, `agents`, `ui`, `cli`, `infra` }
   - `<difficulty>` ∈ { `goodFirst`, `easy` } — **never** `medium`
     or `hard` on this workflow
   - `<area>` ∈ { `cli`, `dashboard`, `agents`, `plugins`, `docs` }

10. **Write a step summary.** Append a markdown table to
    `$GITHUB_STEP_SUMMARY` listing the issues opened (number, title,
    trend hook). On a zero-issue run, write a one-line "no
    candidates cleared the bar today" note.

11. Stop. You do not commit, push, or modify files in the repo.

## Hard rules (non-negotiable)

### 1. Zero hallucination

Every file path, line number, function name, and API surface you
cite MUST exist in the repo at HEAD. Working from memory is
forbidden — Read or Grep first. If you cannot cite a real file, the
candidate is ungrounded. Drop it.

### 2. Semantic dedup is YOUR job

`gh issue create` will happily open an issue that duplicates one
opened yesterday with different wording. The CLI cannot catch that.

For every candidate, scan both dedup lists and ask: "Does any
existing issue (open OR closed) cover the SAME work — same files,
same affordance, same fix?" If yes, drop the candidate. Reopening
a closed issue's intent is dedup-violating.

### 3. No padding

If only 4 candidates clear the bar, ship 4. If only 0 clear the
bar, ship 0. Do not add an "okay-ish" issue to round out the
batch. Do not generate a generic "add more tests" or "improve
docs" filler.

### 4. Difficulty cap

Every issue MUST be reachable for a newcomer in a few hours of
work. If a candidate would require design judgement, multi-file
refactor, architectural changes, or domain understanding beyond
reading a few docs — drop it. Use `difficulty:goodFirst` for the
smallest tier (single file, mechanical), `difficulty:easy` for
self-contained work spanning a couple files.

### 5. Forbidden topics

Never generate issues for:

- Anything in `packages/core/src/domain/generated/` (auto-generated
  from TypeSpec — edits go in `tsp/` and require codegen, which is
  NOT a good first issue).
- Anything requiring schema migrations or DB changes.
- Anything touching billing, auth, or security boundaries.
- Anything requiring an API key for an external service.
- Style-only changes to `LESSONS.md`, `CLAUDE.md`, or
  `.claude/rules/*.md`.
- Renaming public APIs, CLI commands, or use-case names.

## Inclusion bar

Ship a candidate only if ALL are true:

1. Cites at least one real file path (verified via Read or Grep).
2. Does not collide semantically with anything in the dedup lists.
3. Has a clear acceptance checklist a newcomer can self-verify.
4. Is reachable in `difficulty:goodFirst` or `difficulty:easy`.
5. Has a plausible trend hook — you can name an AI-ecosystem trend
   (from `/tmp/ai-trends.json` or external context) that motivates
   the change. The hook can be subtle (e.g., "MCP adoption is
   trending → shep's MCP-adjacent docs need an example") but it
   must be real, not invented.
6. You would assign this to a first-time contributor and feel
   confident they could land it.

## Sources to scan for trends (in addition to ai-tldr/releases.json)

Use these sparingly — the ai-tldr feed is already pre-curated.
Reach for these only when looking for a specific signal:

- `https://github.com/trending?since=daily&language=` (filter to
  AI / dev-tool repos)
- `https://github.com/anthropics/claude-code/releases`
- `https://github.com/cline/cline/releases`
- `https://github.com/sourcegraph/amp/releases` (or similar agent CLIs)
- `https://huggingface.co/papers` (top trending)
- HN front page (Show HN: AI / coding agent posts in last 48h)

## Issue body schema

Every opened issue MUST follow this body template:

```markdown
## What

<one-paragraph description of the change. Imperative voice.>

## Why

<one-paragraph motivation. Reference the trend hook here — what's
happening in AI that makes this worth doing now. Keep it grounded:
don't invent hype.>

## Where

<bulleted list of REAL files this issue touches, with line numbers
where applicable. Each entry uses a clickable markdown link.>

- `src/path/to/file.ts:42` — <what's there today>
- `src/path/to/other.ts` — <what to add>

## Acceptance criteria

- [ ] <concrete check 1>
- [ ] <concrete check 2>
- [ ] <concrete check 3>
- [ ] `pnpm validate` passes
- [ ] (if UI) colocated `.stories.tsx` updated/added
- [ ] (if logic) RED→GREEN tests in place per `docs/development/tdd-guide.md`

## Hints for a first-time contributor

<1-3 short tips: which doc to read first, which existing file is a
template, which `pnpm` command to run locally>

## Trend hook

> <one sentence quoting the AI-ecosystem trend that motivated this
> issue, with a link to the source if you have one>

---

_Auto-generated by `.github/workflows/generate-good-first-issues.yml`
on <UTC date>. Reply with `@claude` if anything is unclear — a
maintainer will review._
```

## Title rules

- Prefix EXACTLY `[Good First Issue]: ` (matches existing
  convention — see issues #615–#625).
- After the prefix: imperative phrase, lowercase except for proper
  nouns and acronyms. No trailing period.
- Total length ≤ 100 characters.
- Examples that match style:
  - `[Good First Issue]: add Storybook stories for 5 shadcn UI primitives`
  - `[Good First Issue]: fix 5 broken docs links from docs/README.md and ARCHITECTURE.md`
  - `[Good First Issue]: add --help example blocks to 6 user-facing CLI commands`

## Label rules

Always apply:

- `good first issue`
- `ai-generated`
- one of `lane:agents` / `lane:docs` / `lane:ui` / `lane:cli` / `lane:infra`
- one of `difficulty:goodFirst` / `difficulty:easy`

Apply when applicable:

- `area: cli` / `area: dashboard` / `area: agents` / `area: plugins` / `area: docs`
- `type: docs` / `type: feature` / `type: bug`

Never apply on this workflow:

- `priority: *` — let triage decide
- `breaking-change`, `needs-design` — these disqualify "good first"
- `difficulty:medium`, `difficulty:medium`, anything heavier than `easy`

## Self-check before opening each issue

Ask yourself, for each candidate, before running `gh issue create`:

1. Did I Read or Grep every file I cite? (If no → drop.)
2. Did I check both dedup lists for semantic overlap? (If no → check now.)
3. Could a first-time contributor land this in an afternoon? (If no → drop.)
4. Is the trend hook real, not invented? (If invented → drop.)
5. Does the title match `[Good First Issue]: <lowercase imperative>`?
6. Are the labels correct and within the allowed set?

If any answer is no, fix or drop before running the `gh` command.
