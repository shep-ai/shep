## Status

- **Phase:** Planning
- **Updated:** 2026-10-09

## Architecture Overview

```
                  producers                                   renderers
 ┌───────────────────────────────┐                ┌──────────────────────────────┐
 │ chat AskUserQuestion (Claude, │  UserQuestion  │ web: InlineBlock{decision}   │
 │ Cursor) ──► AgentQuestion-    │──┐             │   └─ DecisionPanel           │
 │ ExecutorBridge (wired)        │  │ builders    │      (chat turn, inbox,      │
 │ PRD questionnaire             │──┤ (domain/    │       PRD questionnaire)     │
 │ approval gates (publisher)    │──┼─► Decision ─┤ CLI: renderDecisionText +    │
 │ supervisor (answers by id)    │  │  shared)    │      promptDecision          │
 │ ask_decision MCP tool (PR 2)  │──┘             │ notifications / WhatsApp:    │
 └───────────────────────────────┘                │      Decision title/summary  │
                                                  └──────────────────────────────┘
        AskAgentQuestionUseCase ──► agent_questions (decision_json, responses_json)
        AnswerAgentQuestionUseCase ◄── DecisionResponse[] | answer text
             └─ resolves deferred awaiter, forwards gate verdicts by option id
```

## Implementation Strategy

**MANDATORY TDD**: every code task is RED → GREEN → REFACTOR.

1. The model comes first (TypeSpec, then `pnpm generate`), because every other layer imports
   it. Persistence follows so use-case tests can run against the real repository.
2. Pure domain helpers (`decision.ts`: resolve, validate, summarise, picked-recommended;
   `decision-builders.ts`: from UserQuestion[], PRD questionnaire, approval gate, legacy
   string[]) are the single place where answer semantics live. Web, CLI, the bridge, the
   supervisor and the MCP tool all call them.
3. Use cases accept a `Decision` and `DecisionResponse[]`; legacy `options: string[]` callers keep
   working because a Decision is built from them.
4. Producers are migrated one at a time: gate publisher (readable gate decision), bridge wiring
   (chat ↔ inbox race), supervisor router (gate detection by decision kind).
5. Renderers: the pure web draft reducer, then `DecisionPanel`, `AnsweredDecisionRow` and the
   `InlineBlock` registry, then the hosts (chat turn, inbox, PRD questionnaire), then the CLI.
6. PR 2 adds the settings default deadline, `AskAgentDecisionUseCase`, the `ask_decision` MCP tool,
   its injection into headless runs, the timeout → recommended → activity-entry path, and the
   prompt changes.

## Clean Architecture

Domain (`domain/shared/decision*.ts`, generated types) has no dependencies; application use
cases depend only on domain and port interfaces; infrastructure (repository, bridge, MCP tool,
gate publisher) implements ports and is registered by string token; presentation (web, CLI)
reaches core only through use cases resolved from the container.

## Testing Strategy

- Unit: domain helpers (every resolution branch: id, label, custom, outranking, multi-select,
  not allowed), use cases with mocks, bridge race (chat first / inbox first / flag off),
  gate publisher, supervisor router, draft reducer, DecisionPanel (keys, 200 ms advance with
  fake timers, paging, custom outranks, displaced text, answered row, not-resumable), CLI
  renderer, MCP tool handler, prompt wording.
- Integration: repository round-trip of decision + responses with non-default values (create,
  then settle — exercises INSERT and UPDATE), DI resolution of every new token.
- Storybook: DecisionPanel (single, multi, paging, preview, recommended, answered,
  not-resumable), AnsweredDecisionRow, InlineBlock.

## Risks

| Risk | Mitigation |
| --- | --- |
| Chat and inbox both answer the same question | One conditional write (`settlePending`) decides; the loser only resolves its local surface |
| Legacy pending rows without decision_json | `decisionFromLegacyQuestion` builds one at read time |
| Turbopack + `.js` imports from domain | Domain files use extensionless imports; `smoke-imports` test |
| Headless agent stuck waiting | Deadline always set (default 30 min); registry timer + DB poll; timeout settles with the recommendation |

## Rollback

The migration is additive. Reverting the code leaves two unused nullable columns.
