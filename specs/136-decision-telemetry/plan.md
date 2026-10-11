## Architecture

```
web action / CLI / chat bridge / supervisor --(surface)--> AnswerAgentQuestionUseCase
      settlePending ok --> ITelemetry.record(decision.answered, {kind, surface, latency, pickedRecommended})
AskAgentDecisionUseCase deadline --> settlePending(expired) ok --> ITelemetry.record(decision.defaulted, {kind, timeout})
```

Clean Architecture: enums live in TypeSpec (domain), the emit points are application use
cases that depend only on the `ITelemetry` output port, and presentation callers only pass a
`DecisionSurface` value — no infrastructure import moves outward.

Both use cases receive `ITelemetry` by string token. `kind` comes from the stored decision (or
`decisionForQuestion` for legacy rows), latency is `toDurationBucket(answeredAt - createdAt)`,
`pickedRecommended` is `responsesPickedRecommended` (false without responses).

## TDD

- RED: answer use-case tests assert one `decision.answered` with the expected properties per
  surface, none on flag-off / missing / already-settled / lost race; ask-decision tests assert
  `decision.defaulted` on timeout and none when a human wins the deadline race; caller tests
  assert the surface they pass.
- GREEN: inject ITelemetry, emit after the settle, pass surfaces.
- REFACTOR: AskAgentDecisionOutcome → DecisionOutcome enum.

## Risks

Telemetry must never break an answer: ITelemetry.record never throws by contract (spec 133).
