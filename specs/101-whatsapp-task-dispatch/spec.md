## Problem Statement

There is no turnkey solution for Hebrew-speaking teams that combines
cloud-hosted AI development environments, WhatsApp-native task dispatch, and
multi-agent orchestration. These three pain points converge on one unserved
persona: the Israeli solo founder or small dev team shipping AI products from
a **mobile-first** workflow.

shep already provides the orchestration half — parallel AI agents in isolated
worktrees, HITL approval gates, agent notifications, and full Hebrew (`he`)
localization. What is missing is the **last mile to the phone**: a way to
start work, get progress, answer the agent's questions, and approve/reject
gates without leaving WhatsApp — the app this persona already lives in.

## Goal

Let a user run shep's full idea-to-deploy loop from a WhatsApp thread:

- **Dispatch** — send a message ("build X" / "fix Y") and shep creates a
  feature or an interactive application session.
- **Observe** — receive agent lifecycle updates (started, phase, needs
  approval, completed, failed, question) in the originating thread.
- **Steer** — reply in-thread to answer the agent's questions, approve or
  reject HITL gates, and continue an interactive chat session.

## Resolved Decisions

1. **Port-first with two adapters.** A single `IWhatsAppGateway` output port
   abstracts send/receive/connection. Two infrastructure adapters implement
   it: **Baileys (default)** and **WhatsApp Business Cloud API**. The active
   adapter is selectable in Settings. Provider SDKs live ONLY in
   `infrastructure/` (agent-agnostic / provider-agnostic rule).
2. **Scope = dispatch + interactive replies.** Inbound creates features/apps;
   outbound delivers lifecycle notifications; in-thread replies answer
   questions, approve/reject gates, and drive interactive sessions.
3. **Spec-driven, implemented this session** on branch
   `claude/nifty-fermat-CEFLm`.

## Non-Goals (this iteration)

- Group-chat orchestration / multi-user routing within one thread.
- Rich media (voice notes → transcription, image attachments) — text only.
- Outbound marketing/templated broadcast flows.
- Replacing the web/CLI/TUI presentation layers — WhatsApp is an additional
  presentation/transport surface, not a replacement.

## Success Criteria

- [ ] `IWhatsAppGateway` output port defined in `application/ports/output/`
      with no provider-specific types leaking through it.
- [ ] Baileys adapter connects via QR/pairing code, persists multi-file auth
      state under the shep home dir, auto-reconnects, and survives restart.
- [ ] Cloud API adapter implements the same port (send + inbound webhook
      verification) and is selectable via Settings.
- [ ] Inbound text message from a linked number creates a shep feature OR an
      interactive application session through EXISTING use cases (no business
      logic in the transport layer).
- [ ] A persistent `WhatsAppConnectionService` follows the
      NotificationWatcher lifecycle (start/stop/isRunning) and is bootstrapped
      alongside other watchers in the UI/serve startup.
- [ ] Agent lifecycle events fan out to WhatsApp via the existing
      `INotificationService` channel abstraction (new WhatsApp channel),
      delivered to the originating thread.
- [ ] A reply in a thread is routed to: answer an agent question / approve /
      reject a HITL gate / continue an interactive session — via existing use
      cases, keyed by a persisted thread↔session mapping.
- [ ] WhatsApp config + adapter selection + linked-number status live in the
      Settings entity (TypeSpec) and are toggled by a `whatsappDispatch`
      feature flag, wired end-to-end (tsp → migration → mapper → repo SQL →
      defaults → web settings UI → translations).
- [ ] Hebrew-first localized message templates for every outbound message
      type, present in ALL locales (en, ar, es, de, fr, he, pt, uk, ru).
- [ ] All new use cases reachable from web have string-token DI aliases.
- [ ] TDD: failing tests first for every use case and the routing logic; unit
      + integration green; `pnpm validate` + `pnpm build` clean.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `application/ports/output/` | New | `IWhatsAppGateway` + `IWhatsAppThreadMappingRepository` ports. |
| `application/use-cases/whatsapp/` | New | Inbound-dispatch + reply-routing use cases orchestrating existing feature/app/HITL/question use cases. |
| `infrastructure/services/whatsapp/` | New | Baileys + Cloud API adapters, `WhatsAppConnectionService` watcher, message-template renderer. |
| `infrastructure/services/notifications/` | Medium | Add WhatsApp as a fan-out channel in `NotificationService`. |
| `infrastructure/persistence/sqlite/` | Medium | New migration: thread↔session mapping table + settings columns. |
| `infrastructure/di/` | Medium | Register gateway, adapters, connection service, repos, use cases (+ string aliases). |
| `tsp/domain/entities/settings.tsp` | Medium | `WhatsAppConfig` model + `whatsappDispatch` feature flag. |
| `domain/` | Low | New value objects/enums (adapter kind, thread mapping target type) via TypeSpec. |
| `presentation/cli/` | Low | `shep whatsapp` command(s): link (QR/pairing), status, logout. |
| `presentation/web/` | Medium | Settings section: enable, adapter pick, link/QR, connection status (+ Storybook stories). |
| `presentation/cli/commands/{ui,_serve}` | Low | Bootstrap `WhatsAppConnectionService` alongside watchers. |
| `translations/*` | Medium | Outbound message templates + settings strings in all 9 locales. |

## Dependencies

- **021-agent-notifications** — reuses `INotificationService` fan-out and the
  notification event model for outbound delivery.
- **016-hitl-approval-gates** — reply routing approves/rejects via existing
  HITL approve/reject use cases.
- **031-prd-review-questionnaire** — reply routing answers agent questions.
- **013-feature-agent** / interactive sessions — inbound dispatch and chat
  replies drive existing create-feature / create-application /
  send-interactive-message use cases.
- **005-global-settings-service** — WhatsApp config + flag persistence.

## Risks & Mitigations

- **Baileys ToS / number-ban risk** — surfaced to the user; mitigated by the
  port-first design and a ban-safe Cloud API adapter as the swappable
  alternative. Document the risk in settings UI copy.
- **Persistent socket reliability** — auto-reconnect with backoff; auth state
  persisted to disk; connection status surfaced in Settings and via the
  watcher's `isRunning()`.
- **Inbound auth / spoofing** — only messages from explicitly linked numbers
  are actioned; Cloud API webhook signature verification; unknown senders are
  ignored (or get a localized "not linked" reply).
- **Transport-layer logic creep** — strict rule: the gateway/service only
  transports; ALL decisions live in use cases (code-quality rule).

## Size Estimate

**XL** — new port + two infrastructure adapters, a persistent connection
service, several use cases, a new persistence table + migration, the full
settings/feature-flag wiring chain (11+ touchpoints per LESSONS.md), CLI and
web presentation surfaces with Storybook stories, and localized templates
across 9 locales — all under TDD. Will be delivered in phased, independently
testable slices.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
