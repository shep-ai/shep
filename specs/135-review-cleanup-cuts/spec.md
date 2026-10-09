## Problem Statement

The product review found Shep shipping things users did not ask for and cannot see or turn
off: maintainer dogfooding (stale good-first-issue and monthly recap watchers) runs inside
every user's daemon, ASPM is "behind a flag" that defaults on, supply-chain security
duplicates ASPM, four of five cloud-deploy providers are "coming soon" stubs, dead settings
and placeholder agents linger, and the twelve software-factory areas from specs 120–132
landed with no flag at all. There is also no single place to see which flags exist.

## Success Criteria

- [ ] `shep _serve` no longer starts the stale good-first-issue or monthly recap watcher; a
      scheduled workflow in `.github/workflows/` runs both through `shep contributors`
      subcommands that reuse the existing use cases. `/onboarding` leaves the end-user sidebar.
- [ ] A fresh install has `featureFlags.aspm === false`; persisted values are not rewritten;
      ROADMAP.md says ASPM is off by default.
- [ ] Supply-chain security has no flag of its own: every surface follows `featureFlags.aspm`,
      the CLI lives under `shep aspm supply-chain` (with `shep security` kept as a hidden
      alias), and no migration drops data.
- [ ] The Vercel, Netlify, AWS Amplify and GCP Cloud Run stubs, enum members and
      "coming soon" UI are gone; Cloudflare Pages still deploys.
- [ ] `system.autoUpdate` and the Aider/Continue agent types are gone from TypeSpec and code;
      their DB columns stay; persisted `aider`/`continue` values read back as the default agent.
- [ ] Twelve new flags (spaces, trackers, knowledge, signals, opportunities, feedback,
      discovery, incidents, outcomes, docsFirst, autopilot, factory), default on, gate their
      nav entries, pages, API routes, CLI groups and daemon loops; `/settings/feature-flags`
      and `shep settings flags` list every flag with a one-line description and toggle it.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/domain/entities/settings.tsp`, `tsp/common/enums/*` | High | Flags added and removed, enum members removed |
| Settings persistence (mapper, repository, migrations) | High | New flag columns; removed fields stay as read-ignored columns |
| `src/presentation/cli` | Medium | `_serve`, contributors, aspm, settings flags, factory group gating |
| `src/presentation/web` | Medium | Sidebar, factory pages, settings page, new flags view, deploy UI |
| `packages/core` cloud-deploy, agent catalog, feature agent | Medium | Stub removal, catalog entries, supply-chain gate |
| `.github/workflows` | Low | New contributor maintenance workflow; CI security gate path |

## Dependencies

None blocking. Two parallel workstreams (telemetry, unified decisions) may add migrations;
migration numbers are re-checked against `main` before merge.

## Size Estimate

**L** — six independent items touching TypeSpec, persistence, CLI, web and CI, each small to
medium, with the flag work fanning out across every settings fixture.
