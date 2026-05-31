## Status

- **Phase:** Research
- **Updated:** 2026-05-31

## Architecture Fit (Clean Architecture)

The WhatsApp surface is an additional **presentation/transport** layer over the
existing core API. The dependency rule is preserved end-to-end:

- **domain/** — value objects/enums (adapter kind, mapping target type) via TypeSpec only.
- **application/** — `IWhatsAppGateway` + `IWhatsAppThreadMappingRepository` output
  ports; new use cases that orchestrate EXISTING use cases (create-feature,
  create-application, send-interactive-message, approve/reject HITL, answer
  question). No provider imports here.
- **infrastructure/** — Baileys + Cloud API adapters (provider SDK/HTTP lives
  ONLY here), `WhatsAppConnectionService` watcher, localized template renderer,
  SQLite mapping repository + migration, DI registration, and a new WhatsApp
  fan-out channel inside `NotificationService`.
- **presentation/** — `shep whatsapp` CLI command (link/status/logout) and a web
  Settings section (enable, adapter pick, QR/link, status) with Storybook stories.

## Technology Decisions

See the structured `decisions` block above. Headlines:

1. **Port-first, two adapters** (Baileys default, Cloud API ban-safe) selectable
   in Settings.
2. **Baileys as a lazy, optional dependency** — dynamic import, graceful absence
   handling, no package.json/lockfile churn, no bundler risk.
3. **Cloud API over native fetch** — zero new deps.
4. **Reuse existing use cases** for every inbound action.
5. **Persistent watcher service** for the socket lifecycle.
6. **Persisted thread↔session mapping** for reply routing across restarts.

## Library Analysis

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| @whiskeysockets/baileys | ^6.7.23 (legacy/stable; latest is 7.0.0-rc13) | WhatsApp Web socket, QR/pairing, multi-file auth | No Meta approval; personal/business numbers; mobile-first | Violates WhatsApp ToS (ban risk); heavy/native transitive tree; bundler-sensitive |
| WhatsApp Business Cloud API | n/a (HTTP) | Official send + inbound webhook | Ban-safe, production-grade | Requires Meta Business + approved templates; heavier setup |

## Security Considerations

- **Inbound authorization:** only messages from explicitly linked numbers are
  actioned; unknown senders are ignored (optionally answered with a localized
  "not linked" notice). Cloud API webhooks are signature-verified.
- **Credential storage:** Baileys multi-file auth state and Cloud API tokens are
  stored under the shep home dir / Settings; never logged. Treated like other
  secrets (gitleaks-clean).
- **Transport-layer logic creep:** the gateway/service only transports bytes; all
  authorization and routing decisions live in use cases.

## Performance Implications

- A single long-lived socket per linked number; auto-reconnect with backoff.
- Inbound handling is event-driven (no polling); the connection service exposes
  `isRunning()` for health.

## Open Questions

All questions resolved (adapter strategy, dependency strategy, scope confirmed
with the user before scaffolding).

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
