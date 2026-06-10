## Status

- **Phase:** Planning
- **Updated:** 2026-06-09

## Architecture Overview

```
TypeSpec (ProjectMemory + MemoryCategory enum)
      │  pnpm tsp:codegen
      ▼
domain/generated/output.ts ──► application/ports/output/IProjectMemoryRepository
      │                                  ▲
      ▼                                  │
infra: migration 109 ─► SQLite project_memory ─► sqlite-project-memory.repository
                                           │
      ┌────────────────────────────────────┴───────────────────┐
      ▼                                                         ▼
ReadProjectMemoryUseCase                          RecordProjectMemoryUseCase
 (repo → compact blob)                             (upsert entries by key)
      │                                                         ▲
      ▼ (worker seeds state)                                    │ (node persists)
FeatureAgentState.projectMemory ──► analyze/research prompts    │
                                                                │
merge ──routeReexecution──► extract_memory ──► END ─────────────┘
      (only when merged; best-effort; agent distils entries)
```

## Implementation Strategy

**MANDATORY TDD**: every phase below is RED → GREEN → REFACTOR.

The build is inside-out, matching Clean Architecture dependency direction:

1. **Domain first** — define `ProjectMemory` + `MemoryCategory` in TypeSpec and
   regenerate. This is the contract everything else depends on.
2. **Persistence** — additive umzug migration `109` (idempotent CREATE TABLE +
   indexes, mirroring migration 106), then the SQLite repository + mapper behind
   a new output port. Integration test round-trips a non-default value per field
   and exercises upsert (per LESSONS.md: repo SQL must read AND write every col).
3. **Use cases** — `ReadProjectMemoryUseCase` returns a compact, category-
   sectioned blob; `RecordProjectMemoryUseCase` upserts entries by
   (repositoryPath, category, entryKey). Wire both into DI with class token +
   string alias (LESSONS.md: web-reachable use cases need the alias).
4. **Injection** — add optional `projectMemory` state channel; worker loads the
   blob via the read use case and seeds it; analyze + research prompt builders
   render a read-only PROJECT MEMORY section. Absent memory ⇒ no section.
5. **Extraction** — new terminal `extract_memory` node wired after merge
   (`merge → extract_memory → END`). Guards on a successful merge, distils
   entries via the injected executor, persists via the record use case. Any
   failure is logged and swallowed — extraction must never fail the feature.

## Files to Create/Modify

### New Files

| File | Purpose |
| ---- | ------- |
| tsp/domain/entities/project-memory.tsp | `ProjectMemory` entity + `MemoryCategory` enum |
| migrations/109-create-project-memory.ts | Additive `project_memory` table + indexes |
| ports/output/repositories/project-memory-repository.interface.ts | `IProjectMemoryRepository` port |
| repositories/sqlite-project-memory.repository.ts | SQLite implementation (upsert + queries) |
| mappers/project-memory.mapper.ts | Row ⇄ entity mapping |
| use-cases/project-memory/read-project-memory.use-case.ts | Render compact memory blob |
| use-cases/project-memory/record-project-memory.use-case.ts | Upsert extracted entries |
| nodes/extract-memory.node.ts | Post-merge extraction node |
| nodes/prompts/extract-memory.prompt.ts | Extraction prompt builder |

### Modified Files

| File | Changes |
| ---- | ------- |
| tsp/domain/index.tsp | import new entity |
| register-repositories.ts | register `IProjectMemoryRepository` |
| container.ts | register use cases + string aliases |
| state.ts | add `projectMemory?` channel |
| feature-agent-graph.ts | wire `extract_memory` after merge |
| analyze.prompt.ts / research.prompt.ts | render PROJECT MEMORY section |

## Testing Strategy (TDD: Tests FIRST)

### Unit Tests (RED → GREEN → REFACTOR)

- Mapper round-trip (snake_case ⇄ camelCase, every column, both enum halves)
- ReadProjectMemoryUseCase: empty store ⇒ empty blob; multi-category ⇒ sectioned
- RecordProjectMemoryUseCase: insert new; upsert existing by key (no dup)
- analyze/research prompt builders: include section when memory present, omit when absent
- extract_memory node: skips when not merged; persists entries when merged; swallows errors

### Integration Tests

- sqlite-project-memory.repository: create + upsert + listByRepository round-trip on a real DB
- migration 109 applies idempotently (run twice, no error)

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Breaking merge→END resume semantics | Re-point only merge's conditional target to extract_memory, keep routeReexecution; extract_memory is a pure terminal node that always routes to END |
| Required tsp field breaks ~20 fixtures | Make non-invariant fields optional in tsp (LESSONS.md) |
| Repo SQL drops a column silently | Integration round-trip asserts non-default value per field |
| Extraction failure stalls feature | Best-effort: wrap in try/catch, log, return state unchanged |
| Prompt bloat as memory grows | Per-category entry caps in the read use case blob renderer |

---

_Updated by `/shep-kit:plan` — see tasks.yaml for detailed task breakdown_
