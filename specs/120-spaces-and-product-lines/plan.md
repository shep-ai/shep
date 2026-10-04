## Approach

Knowledge isolation is a read-path problem, so the work centres on one use case,
`ResolveSpaceContextUseCase`, which every memory reader and writer calls with a repository
path. It returns the space, the optional product line and the source of the decision
(assignment, rule or default). Resolution logic itself is a pure domain function so the
boundary can be tested exhaustively without a database.

Memory reads become three narrow queries — the repository's Project entries, the line's
ProductLine entries, the space's Space (and legacy Organization) entries — so a missing filter
cannot recreate the leak: there is no longer a query that returns another space's rows to a
prompt.

## Clean Architecture

Domain holds the types (TypeSpec) and the pure resolver; application holds the use cases and
output ports; infrastructure holds the SQLite repositories and DI; presentation (CLI and web)
only calls use cases. No layer imports outward.

## TDD (RED-GREEN-REFACTOR)

Every task starts RED: domain tests for matching and resolution, repository round-trip tests
with non-default values (LESSONS: INSERT and UPDATE column lists), a migration test on a
database that already holds Project and Organization rows, use-case tests with typed port
mocks, a two-space isolation test through the real container, CLI command tests with the DI
override pattern, web component tests plus stories, and server-action tests.

## Risks

| Risk | Mitigation |
| --- | --- |
| An older build after rollback | migration is additive; Organization rows untouched |
| Port mocks across tests break when methods change | update every full mock in the same commit (LESSONS) |
| Path matching differs on Windows | segment-aware, case-insensitive drive letters, tests with C:/ paths |
| A web action resolves an unregistered token | string-token aliases plus container-bootstrap test entries |
