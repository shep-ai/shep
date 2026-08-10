---
name: shep-workstreams
description: Use when a large body of work (a version milestone, an epic, a roadmap, a set of PRDs/design docs) needs to be broken into parallel workstreams and executed with the shep CLI. Triggers include "break this down", "split into workstreams", "plan V6", "what should we build first", "run these in parallel", "dependency graph", "merge order", "worktree split", or any request to turn planning docs into running shep features. Produces a workstream plan first, then drives `shep feat new` / `shep feat start` wave by wave. Part of the Shep autonomous SDLC platform — https://shep.bot
metadata:
  version: '1.0.0'
  author: Shep AI (https://shep.bot)
  homepage: https://shep.bot
  repository: https://github.com/shep-ai/shep
---

# Workstream Breakdown & Parallel Execution with Shep

Turn a large, vague body of work into a small set of **parallel workstreams**, then execute
each one as an isolated shep feature. One workstream = one feature = one worktree = one agent.

## The rule this skill exists to enforce

**Never tell an agent "work on all of it."** That produces context loss, jumping between
unrelated tasks, dozens of touched files, giant commits, and merge conflicts.

Act like a tech lead: partition first, then run one focused agent per partition.

## Two phases, hard separated

```
PHASE 1 — PLAN            PHASE 2 — EXECUTE
(read-only, no shep       (shep feat new / start,
 mutations, produces      wave by wave, monitored)
 WORKSTREAMS.md)
```

**Do not create a single feature until Phase 1 is written down and the user has approved it.**
The plan is cheap. Rework across six half-merged branches is not.

---

## Phase 1 — Produce the workstream plan

### Step 1: Read every source doc, in full

Read all the input material (PRDs, design docs, roadmap, existing specs, issue lists) before
writing anything. Then inventory the **deliverables** — not the docs, the actual things that
must exist when this is done.

### Step 2: Answer the five tech-lead questions

Answer these explicitly in the plan. They are the whole point of the exercise:

1. **What is on the critical path?** Which deliverables block everything else, and which are
   genuinely independent?
2. **What does the dependency graph look like?** Which files and components are shared between
   deliverables? Which subtrees are touched by exactly one deliverable?
3. **What is the right worktree split?** Group deliverables into the *smallest set* of parallel
   branches that minimises merge conflicts. Estimate merge risk for each.
4. **What are the integration milestones?** Replace "finish V6" with contract-level checkpoints
   ("backend contract frozen", "design system frozen", "CRUD complete", "QA").
5. **Which decisions are irreversible?** What should be decided *now* because changing it later
   is expensive — and what should be *deliberately delayed* behind a flag?

### Step 3: Partition on file ownership, not on feature semantics

This is the single highest-leverage rule, and the one most often gotten wrong:

> Two deliverables that both edit the same file belong in the **same** workstream,
> no matter how unrelated they sound. Two deliverables that touch disjoint subtrees belong in
> **different** workstreams, no matter how related they sound.

For the full partitioning rubric — the foundation-first rule, ship-the-small-thing-first rule,
merge-risk scoring, concurrency caps, and the common failure modes — read
`references/partitioning.md`.

### Step 4: Write `WORKSTREAMS.md`

Use `templates/workstream-plan.md`. Every workstream gets, without exception:

| Field | Meaning |
| --- | --- |
| `scope` | What is in it — and an explicit **not in scope** line |
| `blocked_by` / `blocks` | Edges of the dependency graph, by workstream id |
| `expected_files` | Globs. If two workstreams share a glob, one of them is mis-cut |
| `merge_risk` | Low / Medium / High, with the reason |
| `branch` | Recommended branch name |
| `completion_criteria` | Observable, checkable — not "done" |
| `shep_command` | The exact `shep feat new` invocation that starts it |

Then add, at the plan level: the **merge order**, the **integration milestones**, the
**irreversible decisions**, and any work that should be **pulled earlier** into the current
release (small, high-impact, zero-dependency items usually should be).

### Step 5: Stop and get approval

Present the plan. Ask specifically about: the workstream count, the merge order, and anything
recommended for pull-forward. Do not proceed to Phase 2 unapproved.

---

## Phase 2 — Execute with the shep CLI

### The mechanics that matter

Shep already does worktree-per-workstream. **Do not hand-roll `git worktree add`.**

- `shep feat new "<description>"` creates a branch **and an isolated worktree off the repo's
  default branch**, then spawns an agent in it.
- `--pending` creates the feature *without* spawning. `shep feat start <id>` spawns it later.
  This is how you stage waves.
- `--parent <feature-id>` records a real dependency. The child starts `Blocked`. When the parent
  reaches `Implementation`, `Review`, or `Maintain`, shep **automatically rebases the child's
  branch onto the parent's branch and spawns its agent**. Only *direct* children unblock — a
  chain A → B → C cascades one link at a time, which is what you want.
- `--attach <path>` is repeatable. Attach the source PRDs/design docs to every feature so each
  agent has the context without you pasting it.

Full flag reference, monitoring commands, and the PM/work-item commands are in
`references/cli-reference.md`. Read it before composing commands.

### Step 1: Encode the graph, do not improvise it

Create features in dependency order so `--parent` ids exist when you need them.

```bash
# Wave 0 — foundation. Nothing else can start until this reaches Implementation.
shep feat new "Foundation: shared types, API contracts, routing, feature flags, design tokens" \
  --repo /path/to/project \
  --attach docs/v6-overview.md --attach docs/v6-api.md \
  --push --pr

# Note the returned feature id (or: shep feat ls)
```

```bash
# Wave 1 — dependents. Blocked until foundation hits Implementation, then auto-rebased + spawned.
shep feat new "Creator storefront: creator page, claim flow, generated profile" \
  --repo /path/to/project --parent <foundation-id> \
  --attach docs/v6-storefront.md --push --pr

shep feat new "Listings: listing page, CRUD, publish flow, ownership badges" \
  --repo /path/to/project --parent <foundation-id> \
  --attach docs/v6-listings.md --push --pr
```

```bash
# Truly independent, zero shared files — start it immediately, in parallel with foundation.
shep feat new "Attribution: deep links, ?via= params, tracking, creator analytics" \
  --repo /path/to/project --attach docs/v6-attribution.md --push --pr
```

```bash
# Later waves you want held back for capacity, not dependencies — stage them.
shep feat new "Collections: object model, relationships, recommendation surfaces" \
  --repo /path/to/project --parent <foundation-id> --pending
# release when you have the reviewer bandwidth:
shep feat start <collections-id>
```

### Step 2: Choose the dependency mechanism deliberately

| Situation | Use |
| --- | --- |
| B needs A's code | `--parent <A>` — auto-rebase onto A's branch, auto-start |
| B is independent but you lack review capacity now | `--pending`, then `shep feat start` |
| B is independent and you have capacity | plain `shep feat new` — run it now |
| B and A edit the same files | **Not two workstreams.** Merge them into one feature |

`--parent` is not a substitute for good partitioning. If everything is a child of everything,
you have built a sequential pipeline with extra steps.

### Step 3: Respect the concurrency cap

Run at most as many in-flight features as you have **disjoint file sets** — and no more than you
can actually review. Six agents producing six unreviewed PRs is not parallelism, it is a queue
with a worse failure mode. Stage the rest with `--pending`.

### Step 4: Monitor and drive to merge order

```bash
shep feat ls                 # tree: repo → feature → children, with lifecycle + phase
shep feat show <id>          # detail, including what it is waiting on
shep feat logs <id>          # agent output
shep feat approve <id>       # clear an approval gate
shep feat reject <id>        # send it back with feedback
shep feat resume <id>        # resume a stopped or failed feature agent
```

Merge in the plan's stated order. After each merge, re-check `shep feat ls` — a parent reaching
`Implementation` will have unblocked its children automatically, and their rebases may have
surfaced conflicts worth looking at before the next wave.

### Step 5: Track the graph as work items (optional, for larger efforts)

When the effort is big enough that the plan needs to outlive the terminal session, mirror it in
shep's PM layer — `shep project new`, `shep item new`, `shep item relate --type blocking`,
`shep cycle new`, `shep cycle add-items`. See `references/cli-reference.md`.

---

## Anti-patterns — reject these when you see them

- **One mega-feature.** "Implement V6" is not a workstream. If the description needs the word
  "and" three times, split it.
- **Workstreams cut along team or doc boundaries.** Cut along *file* boundaries. The doc
  structure has no idea what shares a schema file.
- **Everything parented to everything.** That is a sequential pipeline. Find the genuinely
  independent slice and run it now.
- **Foundation that keeps growing.** Foundation is contracts, types, routing, flags, tokens —
  and nothing else. The moment it grows a UI, it stops being mergeable and blocks five streams.
- **Deferring the small high-impact slice.** If something is small, near-zero-dependency, and
  valuable, ship it *first*. It validates the pipeline end to end while foundation is in flight.
- **Hand-rolled `git worktree add` alongside shep features.** Shep owns the worktrees. Mixing
  the two loses tracking, gates, auto-rebase, and unblocking.
