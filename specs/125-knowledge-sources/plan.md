## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: provider kinds, passage splitting and ranking are pure domain code; use
cases depend on repository ports, the connection verifier and the knowledge client port; the
Notion client and block converter are infrastructure behind those ports; CLI, web and the
daemon call use cases through the container.

Refactors land first and alone: the connection rename and the shared errors and HTTP, with no
behaviour change. Then Notion behind the knowledge client port, then the knowledge use cases,
then the presentation layers.

## Risks

- Large Notion workspaces: depth and document limits, and content fetched only for edited pages.
- Prompt size: knowledge has its own token budget next to memory's.
