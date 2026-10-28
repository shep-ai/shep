## Status

- **Phase:** Complete
- **Updated:** 2026-10-28

## Clean Architecture

- Domain: pure functions over generated types; no I/O.
- Application: use cases inject ports by string token and other use cases by class; polling
  uses the existing `waitForNextTick` helper; no `process.env`, no timers beyond it.
- Infrastructure: the Herdr adapter is the only code that reads `HERDR_*` and spawns; the A2A
  handler and MCP tools resolve use cases and translate shapes; DI picks the reporter.
- Presentation: route handlers frame JSON / SSE; CLI and TUI format and call use cases.
  Web routes parse query parameters and return the use cases' results; components render
  one serialized activity shape and link to the screens that already act on it.

## TDD

RED-GREEN-REFACTOR for every behavioural task. Every one starts RED: domain branch tables, use-case tests with in-memory
fakes, adapter tests with fake exec / fake use cases, then the integration test with the A2A
SDK client and an e2e CLI test against a seeded SHEP_HOME.

## Testing Strategy

| Layer | Tests |
| ----- | ----- |
| Domain | `feature-state.test.ts` (reasons for every branch, states unchanged), `agent-activity.test.ts` |
| Application | snapshot rows, get / watch / wait / reply / report use cases |
| Infrastructure | Herdr argv + sequence + failure tolerance, MCP tools, A2A handler (each method, errors, version) |
| Integration | A2A over HTTP with `@a2a-js/sdk` client (card, send, get, list, cancel, subscribe); MCP round trip |
| E2E | `shep feat status` / `shep feat wait` against a seeded database |
| Web | Route tests (params, clamping, abort, not found); hook tests (refresh on events, notify loop); component tests for badge, card, list, page client, A2A section; stories for each |
