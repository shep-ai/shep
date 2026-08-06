# <Milestone> — Workstream Execution Plan

> Source documents: `<doc>`, `<doc>`, `<doc>`
> Repository: `<path>` · Default branch: `<branch>`

---

## 1. Critical path

<What blocks everything else, in one paragraph. Name the single workstream that, if it slips,
slips the milestone.>

## 2. Dependency graph

```
main
 │
 ├── A. foundation ──┬── B. <stream>
 │                   ├── C. <stream>
 │                   └── D. <stream>
 │
 └── E. <independent stream — no dependencies, runs immediately>
```

| Workstream | Blocked by | Blocks |
| --- | --- | --- |
| A. Foundation | — | B, C, D |
| B. <name> | A | — |
| C. <name> | A | — |
| D. <name> | A | — |
| E. <name> | — | — |

## 3. Workstreams

### A. Foundation

- **Scope:** <what is in it>
- **Not in scope:** <explicit exclusions — required, not optional>
- **Blocked by:** —
- **Blocks:** B, C, D
- **Expected files:** `types/**`, `lib/api/*.ts`, `app/routes.ts`, `lib/flags.ts`, `styles/tokens.css`
- **Merge risk:** Low — no other stream may touch these files while it is open
- **Branch:** `foundation`
- **Completion criteria:**
  - <observable, checkable>
  - <observable, checkable>
- **Shep command:**
  ```bash
  shep feat new "Foundation: <scope summary>" \
    --repo <path> --no-fast \
    --attach <doc> --attach <doc> \
    --push --pr
  ```

### B. <Name>

- **Scope:**
- **Not in scope:**
- **Blocked by:** A
- **Blocks:** —
- **Expected files:**
- **Merge risk:** <Low/Medium/High> — <reason, naming the concurrent stream it is measured against>
- **Branch:**
- **Completion criteria:**
- **Shep command:**
  ```bash
  shep feat new "<description>" \
    --repo <path> --parent <A-feature-id> \
    --attach <doc> --allow-plan --push --pr
  ```

<Repeat per workstream.>

## 4. Merge order

```
A. Foundation
      ↓
B. <stream>
      ↓
C. <stream>
      ↓
D. <stream>
```

E is independent and merges whenever it is ready — ideally first.

**Rationale:** <why this order minimises rework, one or two sentences>

## 5. Execution waves

| Wave | Workstreams | Launch | Gate to next wave |
| --- | --- | --- | --- |
| 0 | A, E | `shep feat new` immediately | A reaches `Implementation` |
| 1 | B, C | auto-start via `--parent A` | reviewer capacity |
| 2 | D | staged `--pending`, released with `shep feat start` | — |

**Concurrency cap:** <N> in flight — <the binding constraint: disjoint file sets or review capacity>

## 6. Integration milestones

| Milestone | Definition of done | Unblocks |
| --- | --- | --- |
| Backend contract frozen | <observable> | B, C, D |
| Design system frozen | <observable> | B, C |
| <Domain> complete | <observable> | — |
| QA | <observable> | release |

## 7. Irreversible decisions

**Decide now (expensive to change later):**

| Decision | Why now | Owner workstream |
| --- | --- | --- |
| <e.g. slug scheme for creator URLs> | Ends up in public URLs | A |

**Deliberately delay (and the seam that allows it):**

| Decision | Why delay | Seam |
| --- | --- | --- |
| <e.g. recommendation ranking> | No usage data yet | `RecommendationStrategy` interface behind flag `<name>` |

## 8. Pull forward

<Work that should ship in the current release rather than this milestone — typically small,
zero-dependency, high-impact. State the reason for each.>

| Item | Why earlier | Effort |
| --- | --- | --- |
| | | |

## 9. Out of scope for this milestone

<Explicitly listed, so no agent picks it up opportunistically.>
