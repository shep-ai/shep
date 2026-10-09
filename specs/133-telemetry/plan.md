## Status

- **Phase:** Planning
- **Updated:** 2026-10-09

## Architecture Overview

```
 CLI process        worker process        daemon process (shep _serve / web)
 ───────────        ──────────────        ─────────────────────────────────
 cli.command        feature.run.finished  web.area.viewed, onboarding.step,
 error.unhandled    pr.opened / merged    feature.created, pr.merged, heartbeat
      │                   │                         │
      └──── ITelemetry.record(event, typedProps, {onceKey?}) ────┘
                  │  OutboxTelemetry: resolveTelemetryState(env, settings)
                  ▼  off → drop    on → INSERT (+ telemetry_once claim)
           ┌──────────────────────── SQLite ────────────────────────┐
           │ telemetry_outbox (uuid, event, props, attempts, next)  │
           │ telemetry_once (key_hash)   settings.telemetry_*       │
           └────────────────────────────────────────────────────────┘
                  │ TelemetryFlushWatcher (daemon, 60s)
                  ▼ FlushTelemetryUseCase
       re-resolve state ─ off → clear outbox
       TelemetryEnvelopeBuilder (installId, common props, identity if on)
                  ▼ ITelemetryTransport
       PostHog EU /batch/ (no key → no-op, rows wait)   Noop in tests
```

## Implementation Strategy

**MANDATORY TDD**: All phases with executable code follow RED-GREEN-REFACTOR cycles.

Clean Architecture holds throughout: domain rules are pure, use cases see only ports injected
by string token, adapters (SQLite, PostHog, gh, agent files) live in infrastructure, and the
CLI/web reach telemetry only through use cases.

Bottom-up so every layer is testable when the next one lands: TypeSpec and pure domain rules
first (state resolution, buckets, error frame, owner parsing), then the table, repository and
settings columns, then ports, adapters and use cases, then DI. Surfaces come last: CLI command +
notice + hooks, daemon watcher, web onboarding + settings + route tracking, and the one-line
emit points in lifecycle code. Docs land after the capability they describe.

## Testing Strategy (TDD: Tests FIRST)

### Unit Tests

- Domain: every env combination of `resolveTelemetryState`; bucket edges; stack frame parsing
  with POSIX and Windows paths; owner parsing (HTTPS, SSH, non-GitHub).
- Use cases with in-memory doubles: flush success, failure backoff, drop at 5 attempts, opt-out
  clears, unconfigured transport sends nothing; identity toggle strips identity; heartbeat once
  per day; notice shown once.
- Adapters: PostHog body shape and headers with a stubbed fetch; identity reader against a temp
  home; outbox telemetry writes nothing when disabled.
- Web: route template, notice card, settings section (component tests + stories).

### Integration Tests

- Outbox repository against real SQLite: enqueue, once-key claim, due ordering, markFailed,
  exhausted delete, cap trim.
- Settings repository round-trip of every telemetry column with non-default values twice.
- Migration test; DI bootstrap resolves every new token.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Content leak | Typed property map; tests assert envelope keys |
| Telemetry breaks a command | record() never throws; every adapter call wrapped |
| Sends from CI or tests | Domain state forces off; Noop transport in tests; no key by default |
| Double-counted merges | once-key claim in one transaction |
| Migration number collides with parallel workstreams | Renumber after merging main |
| Legal (GDPR) for identity | Owner check recorded; identity toggle; nothing sent without a key |
