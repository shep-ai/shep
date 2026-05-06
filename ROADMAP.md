# Roadmap

What we're building, what's coming next, and what's parked. This file is intentionally thin — every entry links to the spec under [`specs/`](./specs/) where the real conversation lives. If something here looks stale, the linked spec is the source of truth.

Want to influence the roadmap? Open a [feature request](./.github/ISSUE_TEMPLATE/feature-request.yml), drop into [Discord](https://discord.gg/ES6tdVFfur), or claim a [Good First Issue](./GOOD_FIRST_ISSUES.md) and start shipping.

---

## Now — actively shipping

Specs being implemented or about to merge.

- [097 — AI-native contributor onboarding](./specs/097-ai-native-contributor-onboarding/) — `shep doctor`, contributor entity, lane-based grooming, monthly recap, and the static repo polish you're reading right now.
- [096 — AI release notes](./specs/096-ai-release-notes/) — supervisor-gated multi-channel publish for release notes; pattern reused by the contributor recap.
- [095 — DevRel release notes](./specs/095-devrel-release-notes/) — release-notes generation foundation that 096 builds on.
- [094 — Control center SDD mode](./specs/094-control-center-sdd-mode/) — spec-driven mode in the dashboard control center.

## Next — designed, queued

Specs with research and a plan, waiting for implementation capacity.

- [093 — Agent collaboration & supervision](./specs/093-agent-collaboration-supervision/) — supervisor approval gate that every external side-effect runs through.
- [091 — Apps-only surface](./specs/091-apps-only-surface/) — collapse non-app surfaces into a focused, application-shaped UX.
- [090 — AI code review](./specs/090-ai-code-review/) — agent-driven PR review on top of the supervisor gate.
- [089 — Branding & onboarding overhaul](./specs/089-branding-onboarding-overhaul/) — first-run polish, lane copy, contributor positioning.
- [089 — Discord README badge](./specs/089-discord-readme-badge/) — surface the existing Discord community on the README.
- [088 — Import repo upstream](./specs/088-import-repo-upstream/) — pulling existing GitHub issues into Shep's intake pipeline.
- [088 — CLI application management](./specs/088-cli-application-management/) — application lifecycle from the terminal.

## Later — captured, not scheduled

Ideas with a spec but no committed slot. Help wanted on any of these.

- [087 — Dynamic model catalog](./specs/087-dynamic-model-catalog/) — runtime model discovery so we don't ship a hardcoded list.
- [087 — Project management spec](./specs/087-project-management-spec/) — first-class project / portfolio modeling.
- [086 — Multi-provider AI SDK](./specs/086-multi-provider-ai-sdk/) — broader provider coverage behind `IAgentExecutorProvider`.
- [085 — Electron desktop wrapper](./specs/085-electron-desktop-wrapper/) — native desktop shell over the existing web dashboard.
- [085 — Playground prototypes](./specs/085-playground-prototypes/) — disposable spike surface for trying ideas without spec ceremony.

---

## How this list is maintained

- New specs (`/shep-kit:new-feature`) land under `specs/NNN-feature-name/` and are added to **Later** by default.
- Specs being actively implemented move to **Now** when their feature branch is open.
- Specs are removed from this file once they merge — the `CHANGELOG.md` and the relevant `recaps/YYYY-MM.md` are the long-term record.

If a spec you care about isn't here, it either hasn't been written yet (file one) or has already shipped (check `CHANGELOG.md`).

---

## Related

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md) — curated issues to start with
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 10-minute tour of the codebase
- [`specs/`](./specs/) — every active and historical spec
