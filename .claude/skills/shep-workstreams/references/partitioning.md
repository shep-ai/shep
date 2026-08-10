# Partitioning Rubric

How to cut a large body of work into the smallest set of parallel workstreams that minimises
merge conflicts. Read this during Phase 1, before writing `WORKSTREAMS.md`.

---

## 1. Build the file-ownership map first

Before grouping anything, for each deliverable list the files and directories it will touch. Be
concrete — globs, not prose. Then compute the overlaps.

```
deliverable                    expected files
─────────────────────────────  ────────────────────────────────────
creator page                   app/creators/**, components/creator/**, lib/api/creators.ts
claim flow                     app/creators/claim/**, lib/api/creators.ts   ← overlap
listing CRUD                   app/listings/**, lib/api/listings.ts
publish flow                   app/listings/**, lib/api/listings.ts         ← overlap
deep links / ?via=             lib/attribution/**, middleware.ts
shared types                   types/**, lib/api/*.ts                       ← overlaps everything
```

The overlaps *are* the partition. Read them, don't guess at them.

## 2. The cutting rules, in priority order

**Rule 1 — Same file, same workstream.**
Two deliverables that edit the same file belong in one workstream, however unrelated they sound.
This rule wins over every other consideration. Violating it is what produces the conflict-heavy
merges that make parallel agents worse than sequential ones.

**Rule 2 — Anything that overlaps everything becomes foundation, and goes first.**
Shared types, API contracts, routing, feature flags, design tokens. These are the file-overlap
hubs. They belong in a single small workstream that merges before the streams that depend on them.

**Rule 3 — Foundation stays small and mergeable.**
Foundation is contracts and shared primitives. Nothing else. The moment it grows a UI or a
migration or a feature, it stops being a quick merge and it blocks every downstream stream while
it drags. If foundation would take more than a day or two of agent time, split the contracts out
from the implementation and merge the contracts alone.

**Rule 4 — Ship the small, high-impact, zero-dependency slice first.**
If something is small, touches nothing else, and delivers real value, it goes out *before*
foundation lands — in parallel with it. It validates the whole pipeline end to end (branch →
agent → PR → review → merge → deploy) while the risk is low, and often belongs in the current
release rather than the one being planned.

**Rule 5 — Mostly-backend and mostly-frontend work usually separate cleanly.**
Different directories, different tests, different review reflexes. Split them unless they share
a contract file — in which case the contract goes to foundation (Rule 2) and both halves become
independent.

**Rule 6 — Prefer fewer, larger workstreams over many small ones.**
The cost of a workstream is not agent time, it is your review attention and one more branch
drifting from the default branch. Split only when the split buys real parallelism.

## 3. Merge-risk scoring

Score each workstream against the *other workstreams that will be in flight at the same time*.
Risk is a property of a pair, not of a workstream in isolation.

| Risk | Test | Mitigation |
| --- | --- | --- |
| **Low** | Disjoint subtree. No file glob overlaps any concurrent workstream | Run it concurrently. `--allow-all` is reasonable |
| **Medium** | Same directory, different files. Or shares a file that is append-only (a barrel export, a route table, a registry) | Run it concurrently, merge it earlier rather than later. `--allow-plan` |
| **High** | Shares an edited file with a concurrent workstream. Or edits a migration / schema / lockfile another stream also edits | **Re-cut it.** If it genuinely cannot be re-cut, sequence it with `--parent` and keep gates closed |

A plan where most workstreams are High risk has not been partitioned — it has been labelled.
Go back to the file-ownership map.

## 4. Concurrency cap

The number of workstreams to have in flight at once is the **smaller** of:

- the number of mutually disjoint file sets, and
- the number of PRs you can actually review in the same window.

Everything beyond that is staged with `--pending` and released with `shep feat start`. Six
in-flight agents producing six unreviewed PRs is a queue, not parallelism — and every unreviewed
branch drifts further from the default branch while it waits.

## 5. Integration milestones

Replace "finish the milestone" with contract-level checkpoints that can be observed and declared:

- **Backend contract frozen** — API shapes and shared types merged; downstream streams may start.
- **Design system frozen** — tokens and primitives merged; UI streams may start.
- **CRUD complete** — core entity create/read/update/delete paths merged and exercised.
- **<Domain> complete** — one per major workstream.
- **QA** — cross-stream integration testing, after the last merge.

Each milestone should name the workstreams it unblocks. A milestone that unblocks nothing is a
status update, not a milestone.

## 6. Irreversible decisions

Two lists, both required in the plan.

**Decide now** — cheap today, expensive later. Typically: data model and relationships, URL and
routing structure, public API shapes, auth and permission model, ID and slug schemes, anything
that will end up in a database or a published URL. These belong in foundation.

**Deliberately delay** — put it behind a flag or an interface and decide when the information is
better. Typically: ranking and recommendation logic, pricing rules, exact visual design,
third-party vendor choices, caching strategy, anything where the first real usage data will
change the answer.

For each "delay" item, name the flag or seam that makes the delay possible. A deferred decision
with no seam is not deferred — it is just undecided.

## 7. Completion criteria

Every workstream needs criteria that someone other than the author can check:

- Bad: "Collections done"
- Good: "A collection can be created, have listings added and removed, and render at
  `/collections/[slug]`; the collections API is covered by integration tests; the collection card
  has a Storybook story"

If the criteria cannot be written concretely, the workstream's scope is still vague — fix the
scope, not the criteria.

## 8. Common failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Constant rebase conflicts between two streams | Cut on feature semantics, not file ownership | Merge the two streams into one |
| Foundation never lands | Foundation grew implementation | Split contracts out, merge them alone |
| Everything is `--parent` of everything | Dependency graph never actually computed | Build the file-ownership map, find the disjoint sets |
| Agents produce huge unfocused diffs | Workstream scope has no "not in scope" line | Add explicit exclusions to every scope |
| Five PRs waiting on review, none merging | Concurrency cap ignored | Stage the rest with `--pending` |
| Late discovery that two streams assumed different API shapes | Contract was not frozen before dependents started | Enforce the "backend contract frozen" milestone as a real gate |
