# README & Messaging — Action Items

Consolidated from all feedback sources. Updated per README iteration.

**Legend**: README = copy/docs change | PRODUCT = code/feature change | CONTENT = non-code asset (video, screenshots)

---

## P0 — Critical (Trust & First-Run Blockers)

| # | Action | Type | Source | Status |
|---|--------|------|--------|--------|
| 1 | **Decide on `--dangerously-skip-permissions` policy** — Option A: don't use it. Option B: opt-in with consent. Option C: only in `--allow-all` mode. Current state: used silently, undocumented until README-002. | PRODUCT | Reviewer B | Open |
| 2 | **Fix stop/pause reliability** — Chat agent claims to stop but doesn't. Web UI stop button needs to be discoverable. `shep agent stop` must actually halt the agent process. | PRODUCT | Reviewer B | Open |
| 3 | **Detect sandbox mode and warn upfront** — Agent spiraled 3 min on a sandbox-blocked `npm install`. Shep should detect restricted network access and escalate to user immediately, not thrash. | PRODUCT | Reviewer B | Open |
| 4 | **Improve agent auth detection in onboarding** — "Add a project" page shows generic auth error. Should show specific instructions per agent (`claude login`, etc.) with a "check auth" validation button. | PRODUCT | Reviewer B | Open |

## P1 — High (Trust & Credibility)

| # | Action | Type | Source | Status |
|---|--------|------|--------|--------|
| 5 | **Record a 2-min demo GIF/video** — Show full flow: `shep feat new` → plan review → implementation → PR. Single highest-impact trust-builder. No copy change can substitute for proof. | CONTENT | Reviewer A (sim) | In Progress (VHS tape created, GIF placeholder in README) |
| 6 | **Add real-world case study** — "Here's what Shep produced on a real repo" section. Show an actual plan, actual PR, actual result. Even one example changes the credibility equation. | CONTENT | Reviewer A (orig + sim) | Open |
| 7 | **Document adversarial security scenarios** — Separate doc or expanded FAQ: what if the agent introduces a vulnerable dependency? SQL injection? Auth bypass? Answer: CI + linters + review gates. Make it explicit. | README | Reviewer A (orig + sim) | Open |
| 8 | **Add troubleshooting / edge-cases doc** — Monorepos, massive PRs, merge conflicts mid-feature, flaky CI, sandbox restrictions. Real problems real users hit. | README | Reviewer A (orig), Reviewer B | Open |

## P2 — Medium (Messaging & Completeness)

| # | Action | Type | Source | Status |
|---|--------|------|--------|--------|
| 9 | **Add JetBrains IDE support** — IntelliJ, WebStorm, GoLand all use `idea` CLI launcher. Significant market share especially in enterprise. | PRODUCT | Reviewer B | Open |
| 10 | **Add concrete numbers to large codebase FAQ** — Test and document: largest repo tested, file count where research degrades, recommended max. Even approximate numbers beat "depends on your agent." | README | Reviewer A (sim) | Open |
| 11 | **Add "what Shep is NOT" boundary statement** — Explicitly say: not a security scanner, not a CI replacement, not a code editor, not a replacement for your agent. Set boundaries to build trust. | README | Reviewer A (orig) | Done (pain-first README rewrite, spec 090) |
| 12 | **Collect and display user testimonials** — As users adopt Shep, collect quotes. Structure README to accommodate them (Superset has a "wall of love"). | CONTENT | Superset analysis | Open |
| 13 | **Add failure metrics / success rates** — Track and publish: what % of features complete without intervention? Average CI fix retries? This is the ultimate proof point. | PRODUCT + README | Reviewer A (orig + sim) | Open |

## P3 — Low (Polish)

| # | Action | Type | Source | Status |
|---|--------|------|--------|--------|
| 14 | **Add community links** — Discord, Twitter/X, GitHub Discussions. Shows life beyond the repo. | README | Superset analysis | Partial (Discord badge in header, spec 090) |
| 15 | **Changelog link in README header** — Shows active development. Superset does this well. | README | Superset analysis | Done (added to nav bar, spec 090) |
| 16 | **npm package description update** — Current: "Autonomous AI Native SDLC Platform". Proposed: "Ship features, not prompts — structured AI development with requirements, plans, and approval gates" | PRODUCT | Rationale doc | Done (updated to value-focused description, spec 090 phase 1) |

---

## Completed (Across Iterations)

| # | Action | Resolved In | Source |
|---|--------|-------------|--------|
| C1 | Rewrite README with benefit-first structure | README-NEW | Superset analysis |
| C2 | Add "Why Shep?" section with clear user definition | README-NEW | Reviewer A (orig) |
| C3 | Add "What Happens When Things Go Wrong" section | README-NEW | Reviewer A (orig) |
| C4 | Shrink architecture section to table + link | README-NEW | Reviewer A (sim) |
| C5 | Add honest calibration line under tagline | README-NEW-001 | Reviewer A (sim) |
| C6 | Add "Agent mistakes" row to Trust table | README-NEW-001 | Reviewer A (sim) |
| C7 | Add plan.yaml example artifact | README-NEW-001 | Reviewer A (sim) |
| C8 | Add judgment comments to approval gate examples | README-NEW-001 | Reviewer A (sim) |
| C9 | Add CI auto-fix caveats | README-NEW-001 | Reviewer A (sim) |
| C10 | Move "What Goes Wrong" above Features | README-NEW-001 | Reviewer A (sim) |
| C11 | Add "What Shep does NOT protect you from" paragraph | README-NEW-001 | Reviewer A (sim) |
| C12 | Add Prerequisites section with agent auth check | README-NEW-002 | Reviewer B |
| C13 | Add sandbox mode warning in prerequisites | README-NEW-002 | Reviewer B |
| C14 | Honest disclosure of `--dangerously-skip-permissions` in Trust section | README-NEW-002 | Reviewer B |
| C15 | Add "Agent Permissions" subsection with 3-layer safety model | README-NEW-002 | Reviewer B |
| C16 | Add "stop immediately" to failure section + CLI reference + FAQ | README-NEW-002 | Reviewer B |
| C17 | Add sandbox/permissions FAQ entry | README-NEW-002 | Reviewer B |
| C18 | Rename "Web Dashboard" to "Web Dashboard + CLI" | README-NEW-002 | Reviewer B |
| C19 | Remove Claude Code-specific bias — agent-agnostic throughout | README-NEW-002 | Internal review |
| C20 | Add repo/directory context to Quick Start (cd, git init, --repo) | v4.1 | Internal review |
| C21 | Replace cover screenshot with current dashboard image | v4.1 | Internal review |
