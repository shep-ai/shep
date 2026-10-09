# Roadmap

What we're building, what's coming next, and what's parked. This file is intentionally thin — every entry links to the spec under [`specs/`](./specs/) where the real conversation lives. If something here looks stale, the linked spec is the source of truth.

Want to influence the roadmap? Open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml), drop into [Discord](https://discord.gg/ES6tdVFfur), or pick something off the [good first issues](./GOOD_FIRST_ISSUES.md) tracker and start shipping.

---

## Now — actively shipping

Specs being implemented or about to merge.

- [111 — Fleet control plane](./specs/111-fleet-control-plane/) — fleet status bar and triage drawer for running many agents at once. **11 of 19 tasks done**; the first slice merged in #868.
- [098 — ASPM platform](./specs/098-aspm-platform/) — application security posture management: ownership import, scanners, findings surface. **82 of 84 tasks done**, merged in #628 behind the `aspm` feature flag, which is **off by default** (turn it on in Settings → Feature Flags), with the SSE scan stream deferred.

## Next — designed, queued

Specs with research and a plan, waiting for implementation capacity.

*Nothing is queued here right now.* Every spec from 085 through 114 has landed on `main` except the two above. In practice Shep files a spec and picks it up in the same cycle, so this bucket is usually empty — that is the pipeline working, not a gap. If you want something built, [open a feature request](./.github/ISSUE_TEMPLATE/feature-request.yml) or run `/shep-kit:new-feature`.

## Later — captured, not scheduled

Ideas with a spec but no committed slot. Help wanted on any of these.

*Also empty.* See the note above.

---

## Recently shipped

Specs 085–097 all merged and were left on this page long after the fact; they are recorded here once, and will be dropped at the next refresh. Every line was confirmed against `main`.

| Spec | Landed in |
| ---- | --------- |
| [097 — AI-native contributor onboarding](./specs/097-ai-native-contributor-onboarding/) | #611 |
| [096 — AI release notes](./specs/096-ai-release-notes/) | #600 — the Claude tagline + inline evidence in `scripts/release-notes-*.mjs` |
| [095 — DevRel release notes](./specs/095-devrel-release-notes/) | #597 |
| [094 — Control center SDD mode](./specs/094-control-center-sdd-mode/) | #591 |
| [093 — Agent collaboration & supervision](./specs/093-agent-collaboration-supervision/) | #587 — `packages/core/src/infrastructure/services/agents/supervisor-agent/` |
| [091 — Apps-only surface](./specs/091-apps-only-surface/) | #573 — the *Electron Apps-Only* build matrix in `ci.yml` is its artifact |
| [090 — AI code review](./specs/090-ai-code-review/) | #568 — `packages/core/src/infrastructure/services/code-review/` |
| [089 — Branding & onboarding overhaul](./specs/089-branding-onboarding-overhaul/) | #556 |
| [089 — Discord README badge](./specs/089-discord-readme-badge/) | #553 |
| [088 — Import repo upstream](./specs/088-import-repo-upstream/) | #551 |
| [088 — CLI application management](./specs/088-cli-application-management/) | #549 — `shep app new / ls / show / del / deploy` |
| [087 — Project management spec](./specs/087-project-management-spec/) | #552 |
| [087 — Dynamic model catalog](./specs/087-dynamic-model-catalog/) | #544 |
| [086 — Multi-provider AI SDK](./specs/086-multi-provider-ai-sdk/) | #544 — OpenRouter, Together AI, Ollama and LLM Proxy are supported agents today |
| [085 — Electron desktop wrapper](./specs/085-electron-desktop-wrapper/) | #530 — `packages/electron` is a pnpm workspace with mac/win/linux builds and two CI matrices |
| [085 — Playground prototypes](./specs/085-playground-prototypes/) | #540 |

Specs 098–114 also landed in that window (WhatsApp dispatch, Shep Brain project memory, the agentic dev server, LLM Proxy support, adaptive model selection, cluster provisioning, and more). `CHANGELOG.md` is the full record.

---

## How this list is maintained

- New specs (`/shep-kit:new-feature`) land under `specs/NNN-feature-name/` and are added to **Later** by default.
- Specs being actively implemented move to **Now** when their feature branch is open.
- Specs are removed from this file once they merge — the `CHANGELOG.md` and the relevant `recaps/YYYY-MM.md` are the long-term record.
- This page had drifted badly before the reconciliation above: it topped out at 097 while `specs/` had reached 114, and every entry on it had already merged. If the highest number under [`specs/`](./specs/) runs well ahead of anything listed here, that is the symptom; `git log -1 -- specs/NNN-name` tells you whether an entry has already landed.

If a spec you care about isn't here, it either hasn't been written yet (file one) or has already shipped (check `CHANGELOG.md`).

---

## Related

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md) — where to find issues to start with
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 10-minute tour of the codebase
- [`specs/`](./specs/) — every active and historical spec
